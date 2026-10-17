import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import { createDatabase } from '@nthawi/db';
import { loadServerEnv } from '@nthawi/tooling/env';

import { createAuth } from './create-auth.js';
import { createApiResources } from '../resources.js';

// Source and compiled entry points sit at the same depth below the repo root.
// Deployment-injected variables take precedence over this optional local file.
const localEnv = new URL('../../../../.env', import.meta.url);

if (existsSync(localEnv)) {
  loadEnvFile(fileURLToPath(localEnv));
}

// Validate before constructing the pool or authentication services.
export const serverEnv = loadServerEnv();
const databaseOptions = {
  // Two pools cap each API replica at 10 connections; reserve worker/admin capacity.
  max: 5,
  // Bound cold TLS/compute startup separately from the 3s readiness probe.
  connectionTimeoutMillis: 10000,
  queryTimeoutMillis: 3000,
  statementTimeoutMillis: 2000,
  onIdleError: () => console.error('Database idle connection failed.'),
};
export const authDatabase = createDatabase(
  serverEnv.AUTH_DATABASE_URL,
  databaseOptions,
);
export const applicationDatabase = createDatabase(
  serverEnv.DATABASE_URL,
  databaseOptions,
);
export const resources = createApiResources(authDatabase, applicationDatabase);

// Runtime and schema generation use the same configuration factory.
export const auth = createAuth(serverEnv, authDatabase.db);
