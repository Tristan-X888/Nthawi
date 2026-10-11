import { generateKeyPairSync, sign } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDatabase } from '@nthawi/db';
import { loadServerEnv } from '@nthawi/tooling/env';
import {
  createDatabaseTestFixture,
  type DatabaseTestFixture,
} from '../../../packages/db/test/helpers/database-fixture.mjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createApiApplication,
  createApiResources,
  type ApiResources,
} from '../src/application.js';
import { createAuth } from '../src/auth/create-auth.js';
import type { AuthEmail } from '../src/auth/email.js';

const adminUrl = process.env.AUTH_TEST_ADMIN_URL;
if (!adminUrl)
  throw new Error(
    'Set AUTH_TEST_ADMIN_URL to a local disposable PostgreSQL superuser connection.',
  );
const mail: AuthEmail[] = [];
const env = loadServerEnv({
  NODE_ENV: 'test',
  WEB_ORIGIN: 'http://localhost:3000',
  WIDGET_ORIGIN: 'http://localhost:5173',
  BETTER_AUTH_URL: 'http://localhost:4000',
  BETTER_AUTH_SECRET: 'test-only-secret-for-auth-integration-0123456789',
  DATABASE_URL: adminUrl,
  AUTH_DATABASE_URL: adminUrl,
  API_TRUST_PROXY: '127.0.0.1/32,::1/128',
  GOOGLE_CLIENT_ID: 'test-google-client',
  GOOGLE_CLIENT_SECRET: 'test-google-secret',
  RESEND_API_KEY: 'test-resend-key',
  EMAIL_FROM: 'Nthawi <auth@example.test>',
  OPENAI_API_KEY: 'test-openai-key',
});
let databaseFixture: DatabaseTestFixture | undefined;
let setup: ReturnType<typeof createDatabase> | undefined;
let runtime: ReturnType<typeof createDatabase> | undefined;
let resources: ApiResources | undefined;
let app: NestFastifyApplication | undefined;
let ip = 1;

function post(
  path: string,
  body: Record<string, unknown>,
  address = `192.0.2.${ip++}`,
) {
  return request(app!.getHttpServer())
    .post(`/api/auth${path}`)
    .set('Origin', env.WEB_ORIGIN)
    .set('X-Forwarded-For', address)
    .send(body);
}
function latestOtp(email: string) {
  const message = mail.findLast((message) => message.to === email);
  expect(message).toBeDefined();
  const otp = message!.text.match(/\b\d{6}\b/)?.[0];
  expect(otp).toBeDefined();
  return otp!;
}
function cookies(headers: Record<string, unknown>) {
  const values = headers['set-cookie'];
  expect(Array.isArray(values)).toBe(true);
  return (values as string[]).map((value) => value.split(';')[0]).join('; ');
}

async function passwordAccount(email: string) {
  const password = 'Account-management-test-password-123!';
  const signup = await post('/sign-up/email', {
    email,
    password,
    name: 'Account Owner',
  });
  expect(signup.status).toBe(200);
  expect(
    (await post('/email-otp/verify-email', { email, otp: latestOtp(email) }))
      .status,
  ).toBe(200);
  const signin = await post('/sign-in/email', { email, password });
  expect(signin.status).toBe(200);
  return { id: signin.body.user.id as string, cookie: cookies(signin.headers) };
}

beforeAll(async () => {
  databaseFixture = await createDatabaseTestFixture(adminUrl);
  env.AUTH_DATABASE_URL = databaseFixture.urls.auth;
  env.DATABASE_URL = databaseFixture.urls.business;
  setup = createDatabase(databaseFixture.urls.admin);
  runtime = createDatabase(databaseFixture.urls.auth, { max: 2 });
  resources = createApiResources(
    runtime,
    createDatabase(databaseFixture.urls.business, { max: 2 }),
  );
  const auth = createAuth(env, runtime.db, async (message) => {
    mail.push(message);
  });
  app = await createApiApplication({ env, auth, resources, logger: false });
});

afterAll(async () => {
  try {
    await app?.close();
  } finally {
    try {
      await resources?.close();
    } finally {
      try {
        await setup?.pool.end();
      } finally {
        await databaseFixture?.close();
      }
    }
  }
});

describe('Better Auth over Nest/Fastify and PostgreSQL', () => {
  it('serves database-independent liveness through the application', async () => {
    const response = await request(app!.getHttpServer()).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('reports readiness using restricted runtime database capabilities', async () => {
    const response = await request(app!.getHttpServer()).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns an allowlisted owner summary using the authenticated session', async () => {
    const owner = await passwordAccount('me-owner@example.test');
    const response = await request(app!.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', owner.cookie)
      .set('Origin', env.WEB_ORIGIN);
    expect(response.status).toBe(200);
    expect(response.body.owner).toEqual({
      id: owner.id,
      name: 'Account Owner',
      email: 'me-owner@example.test',
      emailVerified: true,
    });
    expect(Object.keys(response.body).sort()).toEqual(['owner', 'session']);
    expect(Object.keys(response.body.session).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'freshUntil',
    ]);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects missing and invalid owner cookies without caching errors', async () => {
    for (const cookie of [undefined, 'better-auth.session_token=invalid']) {
      const call = request(app!.getHttpServer()).get('/api/v1/me');
      if (cookie) call.set('Cookie', cookie);
      const response = await call;
      expect(response.status).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('uses the authoritative session after revocation and expiry', async () => {
    const owner = await passwordAccount('revocation-owner@example.test');
    expect(
      (await post('/sign-out', {}).set('Cookie', owner.cookie)).status,
    ).toBe(200);
    const revoked = await request(app!.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', owner.cookie);
    expect(revoked.status).toBe(401);
    expect(revoked.headers['cache-control']).toBe('no-store');

    const expiring = await passwordAccount('expiry-owner@example.test');
    await setup!.pool.query(
      "UPDATE public.session SET expires_at = now() - interval '1 second' WHERE user_id = $1",
      [expiring.id],
    );
    const expired = await request(app!.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', expiring.cookie);
    expect(expired.status).toBe(401);
  });

  it('rejects a session whose owner is no longer email verified', async () => {
    const owner = await passwordAccount('unverified-owner@example.test');
    await setup!.pool.query(
      'UPDATE public."user" SET email_verified = false WHERE id = $1',
      [owner.id],
    );
    const response = await request(app!.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', owner.cookie);
    expect(response.status).toBe(403);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects foreign owner origins before database session access', async () => {
    const owner = await passwordAccount('origin-owner@example.test');
    const role = databaseFixture!.roles.auth;
    await setup!.pool.query(`REVOKE SELECT ON public.session FROM "${role}"`);
    try {
      for (const origin of [
        env.WIDGET_ORIGIN,
        'https://attacker.example.test',
        'null',
      ]) {
        const response = await request(app!.getHttpServer())
          .get('/api/v1/me')
          .set('Origin', origin)
          .set('Cookie', owner.cookie);
        expect(response.status).toBe(403);
        expect(response.headers['cache-control']).toBe('no-store');
      }
    } finally {
      await setup!.pool.query(`GRANT SELECT ON public.session TO "${role}"`);
    }
  });

  it('sanitizes authentication failures and readiness when identity access fails', async () => {
    const owner = await passwordAccount('database-failure-owner@example.test');
    const token = (
      await setup!.pool.query(
        'SELECT token FROM public.session WHERE user_id = $1',
        [owner.id],
      )
    ).rows[0].token as string;
    const errors: unknown[][] = [];
    const output = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        errors.push(args);
      });
    const role = databaseFixture!.roles.auth;
    await setup!.pool.query(`REVOKE SELECT ON public.session FROM "${role}"`);
    try {
      const response = await request(app!.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', owner.cookie);
      expect(response.status).toBe(503);
      expect(response.headers['cache-control']).toBe('no-store');
      const ready = await request(app!.getHttpServer()).get('/health/ready');
      expect(ready.status).toBe(503);
      expect(ready.headers['cache-control']).toBe('no-store');
      expect(ready.body).toMatchObject({
        status: 'not_ready',
        code: 'API_NOT_READY',
      });
      const live = await request(app!.getHttpServer()).get('/health/live');
      expect(live.status).toBe(200);
      const exposed = JSON.stringify({ body: response.body, errors });
      expect(exposed).not.toContain(token);
      expect(exposed).not.toContain(owner.cookie);
      expect(exposed).not.toContain(databaseFixture!.urls.auth);
      expect(exposed).not.toContain('permission denied');
    } finally {
      await setup!.pool.query(`GRANT SELECT ON public.session TO "${role}"`);
      output.mockRestore();
    }
  });

  it('mounts the auth handler and keeps identity tables outside tenant RLS', async () => {
    const response = await request(app!.getHttpServer()).get('/api/auth/ok');
    expect(response.status).toBe(200);
    const roles = await runtime!.pool.query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    expect(roles.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const flags = await setup!.pool.query(
      "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)",
      [['user', 'session', 'account', 'verification', 'rate_limit']],
    );
    expect(flags.rowCount).toBe(5);
    for (const row of flags.rows) {
      expect(row.relrowsecurity).toBe(false);
      expect(row.relforcerowsecurity).toBe(false);
    }
  });

  it('allows owner-app preflight requests before authentication body parsing', async () => {
    const response = await request(app!.getHttpServer())
      .options('/api/auth/sign-in/email')
      .set('Origin', env.WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      env.WEB_ORIGIN,
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('produces the Google authorization URL with the API callback and web return URL', async () => {
    const response = await post('/sign-in/social', {
      provider: 'google',
      callbackURL: env.WEB_ORIGIN,
    });
    expect(response.status).toBe(200);
    const authorization = new URL(response.body.url as string);
    expect(authorization.hostname).toBe('accounts.google.com');
    expect(authorization.searchParams.get('client_id')).toBe(
      env.GOOGLE_CLIENT_ID,
    );
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      `${env.BETTER_AUTH_URL}/api/auth/callback/google`,
    );
  });

  it('requires verification before password sign-in and creates a usable session afterward', async () => {
    const email = 'password-owner@example.test';
    const password = 'Long-test-password-123!';
    const signup = await post('/sign-up/email', {
      email,
      password,
      name: 'Password Owner',
    });
    expect(signup.status).toBe(200);
    expect(signup.headers['access-control-allow-origin']).toBe(env.WEB_ORIGIN);
    expect(signup.headers['access-control-allow-credentials']).toBe('true');
    expect(signup.body.token).toBeNull();
    expect(signup.body.user.emailVerified).toBe(false);
    const credential = await setup!.pool.query(
      'SELECT password FROM account WHERE user_id = $1',
      [signup.body.user.id],
    );
    expect(credential.rows[0].password).not.toBe(password);
    const denied = await post('/sign-in/email', { email, password });
    expect(denied.status).toBe(403);
    const verify = await post('/email-otp/verify-email', {
      email,
      otp: latestOtp(email),
    });
    expect(verify.status).toBe(200);
    const signin = await post('/sign-in/email', { email, password });
    expect(signin.status).toBe(200);
    expect(String(signin.headers['set-cookie'])).toContain('HttpOnly');
    const session = await request(app!.getHttpServer())
      .get('/api/auth/get-session')
      .set('Cookie', cookies(signin.headers));
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe(email);
  });

  it('supports OTP signup/sign-in, stores only hashed codes, and rejects replay', async () => {
    const email = 'otp-owner@example.test';
    expect(
      (
        await post('/email-otp/send-verification-otp', {
          email,
          type: 'sign-in',
        })
      ).status,
    ).toBe(200);
    const otp = latestOtp(email);
    const stored = await setup!.pool.query(
      'SELECT value FROM verification WHERE identifier LIKE $1',
      [`%${email}%`],
    );
    expect(stored.rowCount).toBeGreaterThan(0);
    for (const row of stored.rows) expect(row.value).not.toContain(otp);
    const signin = await post('/sign-in/email-otp', {
      email,
      otp,
      name: 'OTP Owner',
    });
    expect(signin.status).toBe(200);
    expect(signin.body.user.emailVerified).toBe(true);
    expect((await post('/sign-in/email-otp', { email, otp })).status).toBe(400);
  });

  it('resets a password using OTP and invalidates the old password and session', async () => {
    const email = 'password-owner@example.test';
    const old = await post('/sign-in/email', {
      email,
      password: 'Long-test-password-123!',
    });
    expect(old.status).toBe(200);
    expect(
      (await post('/email-otp/request-password-reset', { email })).status,
    ).toBe(200);
    const password = 'Replacement-test-password-456!';
    expect(
      (
        await post('/email-otp/reset-password', {
          email,
          otp: latestOtp(email),
          password,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post('/sign-in/email', {
          email,
          password: 'Long-test-password-123!',
        })
      ).status,
    ).toBe(401);
    expect((await post('/sign-in/email', { email, password })).status).toBe(
      200,
    );
    const revoked = await request(app!.getHttpServer())
      .get('/api/auth/get-session')
      .set('Cookie', cookies(old.headers));
    expect(revoked.body).toBeNull();
  });

  it('supports the password reset link callback without disclosing delivery details', async () => {
    const email = 'password-owner@example.test';
    expect(
      (
        await post('/request-password-reset', {
          email,
          redirectTo: `${env.WEB_ORIGIN}/reset-password`,
        })
      ).status,
    ).toBe(200);
    const message = mail.findLast((message) => message.to === email)!;
    const link = new URL(message.text.match(/https?:\/\/\S+/)![0]);
    const token = link.pathname.split('/').at(-1);
    expect(
      (
        await post('/reset-password', {
          token,
          newPassword: 'Another-test-password-789!',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post('/sign-in/email', {
          email,
          password: 'Another-test-password-789!',
        })
      ).status,
    ).toBe(200);
  });

  it('rejects widget origins for owner authentication', async () => {
    const response = await request(app!.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', env.WIDGET_ORIGIN)
      .send({
        email: 'password-owner@example.test',
        password: 'Another-test-password-789!',
      });
    expect(response.status).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('requires explicit Google linking for an existing verified email while allowing new Google users', async () => {
    const email = 'link-owner@example.test';
    const owner = await passwordAccount(email);
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    function googleToken(address: string) {
      const issuedAt = Math.floor(Date.now() / 1000);
      const header = Buffer.from(
        JSON.stringify({ alg: 'RS256', kid: 'test-google-key', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'https://accounts.google.com',
          aud: env.GOOGLE_CLIENT_ID,
          sub: `google-${address}`,
          email: address,
          email_verified: true,
          name: 'Google Owner',
          iat: issuedAt,
          exp: issuedAt + 300,
        }),
      ).toString('base64url');
      const unsigned = `${header}.${payload}`;
      return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
    }
    // Only Google's public-key service is mocked; JWT verification, HTTP
    // routing, linking decisions and database writes use the real implementation.
    const googleKeys = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) => {
        const requestedUrl =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url;
        expect(requestedUrl).toBe('https://www.googleapis.com/oauth2/v3/certs');
        return Response.json({
          keys: [
            {
              ...publicKey.export({ format: 'jwk' }),
              kid: 'test-google-key',
              alg: 'RS256',
              use: 'sig',
            },
          ],
        });
      });
    try {
      const idToken = { token: googleToken(email) };
      const denied = await post('/sign-in/social', {
        provider: 'google',
        idToken,
      });
      expect(denied.status).toBe(401);
      expect(denied.headers['set-cookie']).toBeUndefined();
      expect(
        (
          await setup!.pool.query(
            'SELECT provider_id FROM account WHERE user_id = $1',
            [owner.id],
          )
        ).rows,
      ).toEqual([{ provider_id: 'credential' }]);
      const linked = await post('/link-social', {
        provider: 'google',
        idToken,
      }).set('Cookie', owner.cookie);
      expect(linked.status).toBe(200);
      const signin = await post('/sign-in/social', {
        provider: 'google',
        idToken,
      });
      expect(signin.status).toBe(200);
      expect(signin.body.user.id).toBe(owner.id);
      const signup = await post('/sign-in/social', {
        provider: 'google',
        idToken: { token: googleToken('new-google-owner@example.test') },
      });
      expect(signup.status).toBe(200);
      expect(signup.body.user.id).not.toBe(owner.id);
    } finally {
      googleKeys.mockRestore();
    }
  });

  it('prevents unlinking the last login account', async () => {
    const owner = await passwordAccount('unlink-owner@example.test');
    const accounts = await setup!.pool.query(
      'SELECT id FROM account WHERE user_id = $1',
      [owner.id],
    );
    const response = await post('/unlink-account', {
      accountId: accounts.rows[0].id,
    }).set('Cookie', owner.cookie);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('FAILED_TO_UNLINK_LAST_ACCOUNT');
    expect(
      (
        await setup!.pool.query('SELECT id FROM account WHERE user_id = $1', [
          owner.id,
        ])
      ).rowCount,
    ).toBe(1);
  });

  it('changes email only after verifying an OTP bound to the new address', async () => {
    const email = 'email-change-owner@example.test';
    const newEmail = 'changed-owner@example.test';
    const owner = await passwordAccount(email);
    expect(
      (await post('/email-otp/request-email-change', { newEmail })).status,
    ).toBe(401);
    // The link endpoint stays disabled while verification uses OTP.
    expect(
      (await post('/change-email', { newEmail }).set('Cookie', owner.cookie))
        .status,
    ).toBe(400);
    expect(
      (
        await post('/email-otp/request-email-change', { newEmail }).set(
          'Cookie',
          owner.cookie,
        )
      ).status,
    ).toBe(200);
    const otp = latestOtp(newEmail);
    const stored = await setup!.pool.query(
      'SELECT value FROM verification WHERE identifier LIKE $1',
      [`%${newEmail}%`],
    );
    expect(stored.rowCount).toBeGreaterThan(0);
    for (const row of stored.rows) expect(row.value).not.toContain(otp);
    const wrongOtp = otp === '000000' ? '000001' : '000000';
    expect(
      (
        await post('/email-otp/change-email', { newEmail, otp: wrongOtp }).set(
          'Cookie',
          owner.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await setup!.pool.query('SELECT email FROM "user" WHERE id = $1', [
          owner.id,
        ])
      ).rows[0].email,
    ).toBe(email);
    expect(
      (
        await post('/email-otp/change-email', { newEmail, otp }).set(
          'Cookie',
          owner.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await setup!.pool.query(
          'SELECT email, email_verified FROM "user" WHERE id = $1',
          [owner.id],
        )
      ).rows[0],
    ).toEqual({ email: newEmail, email_verified: true });
    expect(
      (
        await post('/email-otp/change-email', {
          newEmail: 'replay-owner@example.test',
          otp,
        }).set('Cookie', owner.cookie)
      ).status,
    ).toBe(400);
  });

  it('rejects deletion after fifteen minutes and removes identity records with a fresh session', async () => {
    const owner = await passwordAccount('delete-owner@example.test');
    expect((await post('/delete-user', {})).status).toBe(401);
    await setup!.pool.query(
      'UPDATE "session" SET created_at = now() - interval \'16 minutes\' WHERE user_id = $1',
      [owner.id],
    );
    const stale = await post('/delete-user', {}).set('Cookie', owner.cookie);
    expect(stale.status).toBe(400);
    expect(stale.body.code).toBe('SESSION_EXPIRED');
    expect(
      (
        await setup!.pool.query('SELECT id FROM "user" WHERE id = $1', [
          owner.id,
        ])
      ).rowCount,
    ).toBe(1);
    await setup!.pool.query(
      'UPDATE "session" SET created_at = now() - interval \'14 minutes\' WHERE user_id = $1',
      [owner.id],
    );
    expect(
      (await post('/delete-user', {}).set('Cookie', owner.cookie)).status,
    ).toBe(200);
    for (const table of ['user', 'session', 'account']) {
      const column = table === 'user' ? 'id' : 'user_id';
      expect(
        (
          await setup!.pool.query(
            `SELECT * FROM "${table}" WHERE "${column}" = $1`,
            [owner.id],
          )
        ).rowCount,
      ).toBe(0);
    }
    const session = await request(app!.getHttpServer())
      .get('/api/auth/get-session')
      .set('Cookie', owner.cookie);
    expect(session.body).toBeNull();
  });

  it('limits repeated OTP requests through the shared database rate limiter', async () => {
    const address = '192.0.2.240';
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(
        (
          await post(
            '/email-otp/send-verification-otp',
            { email: 'limited@example.test', type: 'sign-in' },
            address,
          )
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await post(
          '/email-otp/send-verification-otp',
          { email: 'limited@example.test', type: 'sign-in' },
          address,
        )
      ).status,
    ).toBe(429);
    expect(
      (await setup!.pool.query('SELECT * FROM rate_limit')).rowCount,
    ).toBeGreaterThan(0);
  });
});
