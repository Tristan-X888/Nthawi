import type { AppDatabase } from '@nthawi/db';
import { loadServerEnv } from '@nthawi/tooling/env';
import { describe, expect, it } from 'vitest';
import { createAuth } from './create-auth.js';

const env = loadServerEnv({
  NODE_ENV: 'test',
  WEB_ORIGIN: 'http://owner.example.test',
  WIDGET_ORIGIN: 'http://widget.example.test',
  DATABASE_URL: 'postgresql://business:synthetic@127.0.0.1:1/test',
  AUTH_DATABASE_URL: 'postgresql://auth:synthetic@127.0.0.1:1/test',
  BETTER_AUTH_SECRET: 'synthetic-test-secret-longer-than-32-characters',
  BETTER_AUTH_URL: 'http://owner.example.test',
  GOOGLE_CLIENT_ID: 'synthetic',
  GOOGLE_CLIENT_SECRET: 'synthetic',
  RESEND_API_KEY: 'synthetic',
  EMAIL_FROM: 'Nthawi <test@example.test>',
  OPENAI_API_KEY: 'synthetic',
});

describe('authentication policy', () => {
  // Better Auth's delete-user removes identity rows directly. That bypasses the
  // deletion journal, the immediate-denial/7-day-purge contract and the Phase 4
  // export barrier, and a restore could resurrect the account. Account deletion
  // must go through the reviewed Phase 6 design (D6-6), never this endpoint.
  it('never enables Better Auth self-service user deletion', () => {
    const auth = createAuth(env, {} as AppDatabase, async () => undefined);
    expect(auth.options.user?.deleteUser?.enabled).toBe(false);
  });
});
