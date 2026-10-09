import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import { createDatabase } from '@nthawi/db';
import { loadServerEnv } from '@nthawi/tooling/env';

import { createAuth } from './create-auth.js';

// Source and compiled entry points sit at the same depth below the repo root.
// Deployment-injected variables take precedence over this optional local file.
const localEnv = new URL('../../../../.env', import.meta.url);

if (existsSync(localEnv)) {
  loadEnvFile(fileURLToPath(localEnv));
}

// Validate before constructing the pool or authentication services.
export const serverEnv = loadServerEnv();
export const authDatabase = createDatabase(serverEnv.DATABASE_URL);

// Runtime and schema generation use the same configuration factory.
export const auth = createAuth(serverEnv, authDatabase.db);
