import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { loadServerEnv } from '@nthawi/tooling/env';
import type { DatabaseHandle } from '@nthawi/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApplication } from '../application.js';

const secret = 'synthetic-proxy-secret-longer-than-32-characters';
const env = loadServerEnv({
  NODE_ENV: 'test',
  WEB_ORIGIN: 'http://owner.example.test',
  WIDGET_ORIGIN: 'http://widget.example.test',
  DATABASE_URL: 'postgresql://business:synthetic@127.0.0.1:1/test',
  AUTH_DATABASE_URL: 'postgresql://auth:synthetic@127.0.0.1:1/test',
  BETTER_AUTH_SECRET: 'synthetic-auth-secret-longer-than-32-characters',
  BETTER_AUTH_URL: 'http://owner.example.test',
  GOOGLE_CLIENT_ID: 'synthetic',
  GOOGLE_CLIENT_SECRET: 'synthetic',
  RESEND_API_KEY: 'synthetic',
  EMAIL_FROM: 'test@example.test',
  OPENAI_API_KEY: 'synthetic',
  NETLIFY_PROXY_SIGNING_SECRET: secret,
  PROXY_EXPECTED_SITE_URL: 'https://owner-staging.netlify.app',
  PROXY_EXPECTED_NETLIFY_ID: 'synthetic-owner-staging-site',
  PROXY_EXPECTED_DEPLOY_CONTEXT: 'production',
});
const applications: NestFastifyApplication[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

function token(
  claims: Record<string, unknown> = {},
  key = secret,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = {
    iss: 'netlify',
    exp: Math.floor(Date.now() / 1000) + 60,
    site_url: env.PROXY_EXPECTED_SITE_URL,
    netlify_id: env.PROXY_EXPECTED_NETLIFY_ID,
    deploy_context: env.PROXY_EXPECTED_DEPLOY_CONTEXT,
    ...claims,
  };
  const input = `${encode(header)}.${encode(payload)}`;
  return `${input}.${createHmac('sha256', key).update(input).digest('base64url')}`;
}

async function fixture(configuration = env) {
  const getSession = vi.fn().mockResolvedValue(null);
  const handler = vi.fn(
    async (_request: Request) => new Response(null, { status: 204 }),
  );
  const connect = vi.fn();
  const database = () =>
    ({ db: {}, pool: { connect } }) as unknown as DatabaseHandle;
  const app = await createApiApplication({
    env: configuration,
    auth: { handler, api: { getSession } },
    resources: {
      authDatabase: database(),
      applicationDatabase: database(),
      close: async () => {},
    },
    logger: false,
  });
  applications.push(app);
  return { app, getSession, handler, connect };
}

describe('signed owner ingress HTTP boundary', () => {
  it('marks every staging API response noindex using configured identity, including errors and health', async () => {
    const { app } = await fixture({
      ...env,
      WEB_ORIGIN: 'https://app-staging.nthawi.io',
      BETTER_AUTH_URL: 'https://app-staging.nthawi.io',
      WIDGET_ORIGIN: 'https://widget-staging.nthawi.io',
    });
    for (const [url, headers] of [
      ['/health/live', {}],
      ['/api/auth/get-session', {}],
      ['/api/auth/get-session', { 'x-nf-sign': token() }],
      ['/missing-route', {}],
    ] as const) {
      const response = await app.inject({ method: 'GET', url, headers });
      expect(response.headers['x-robots-tag']).toBe(
        'noindex, nofollow, noarchive',
      );
    }
    const { app: other } = await fixture();
    const response = await other.inject({
      method: 'GET',
      url: '/health/live',
      headers: { host: 'api-staging.nthawi.io' },
    });
    expect(response.headers['x-robots-tag']).toBeUndefined();
  });

  it('prevents shared caching and removes upstream validators on signed owner responses', async () => {
    const { app, handler } = await fixture();
    handler.mockImplementation(
      async () =>
        new Response(null, {
          status: 204,
          headers: {
            'cache-control': 'public,max-age=3600',
            etag: 'synthetic-validator',
            'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
          },
        }),
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { 'x-nf-sign': token(), origin: env.WEB_ORIGIN },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.etag).toBeUndefined();
    expect(response.headers['last-modified']).toBeUndefined();
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
  });

  it('serves JSON probes with API security headers and no credentialed CORS', async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { origin: env.WEB_ORIGIN },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
  });

  it('accepts a request through the real local signer over HTTP and rejects the direct unsigned equivalent', async () => {
    const siteUrl = 'http://127.0.0.1:8890';
    const { app, handler, connect } = await fixture({
      ...env,
      WEB_ORIGIN: siteUrl,
      BETTER_AUTH_URL: siteUrl,
      PROXY_EXPECTED_SITE_URL: siteUrl,
      PROXY_EXPECTED_DEPLOY_CONTEXT: 'dev',
    });
    let signer: Server | undefined;
    try {
      await app.listen(0, '127.0.0.1');
      const apiAddress = app.getHttpServer().address() as AddressInfo;
      const apiOrigin = `http://127.0.0.1:${apiAddress.port}`;
      const signerModule = new URL(
        '../../../../scripts/dev-signed-proxy.mjs',
        import.meta.url,
      );
      const { createSignedProxy } = await import(signerModule.href);
      signer = createSignedProxy({
        apiOrigin,
        webOrigin: 'http://127.0.0.1:1',
        signingSecret: secret,
        siteUrl,
        netlifyId: env.PROXY_EXPECTED_NETLIFY_ID,
        deployContext: 'dev',
      }) as Server;
      await new Promise<void>((resolve, reject) => {
        signer!.once('error', reject);
        signer!.listen(0, '127.0.0.1', resolve);
      });
      const signerAddress = signer.address() as AddressInfo;
      const throughSigner = await fetch(
        `http://127.0.0.1:${signerAddress.port}/api/auth/get-session`,
      );
      expect(throughSigner.status).toBe(204);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]![0].headers.get('x-nthawi-client-ip')).toBe(
        '127.0.0.1',
      );
      const direct = await fetch(`${apiOrigin}/api/auth/get-session`);
      expect(direct.status).toBe(401);
      expect((await direct.json()).code).toBe('PROXY_SIGNATURE_REQUIRED');
      expect(handler).toHaveBeenCalledOnce();
      expect(connect).not.toHaveBeenCalled();
    } finally {
      if (signer) {
        signer.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
          signer!.close((error) => (error ? reject(error) : resolve()));
        });
      }
      await app.close();
    }
  });

  it('rejects replay after expiration even when that token was previously accepted', async () => {
    const { app } = await fixture();
    const now = Date.now();
    const signed = token({ exp: Math.floor(now / 1000) + 1 });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/auth/get-session',
          headers: { 'x-nf-sign': signed },
        })
      ).statusCode,
    ).toBe(204);
    vi.spyOn(Date, 'now').mockReturnValue(now + 2000);
    const replay = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { 'x-nf-sign': signed },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).toBe('PROXY_SIGNATURE_INVALID');
  });
  it('refuses a manually constructed hosted environment without ingress despite a development NODE_ENV', async () => {
    await expect(
      fixture({
        ...env,
        NODE_ENV: 'development',
        WEB_ORIGIN: 'https://app-staging.nthawi.io',
        NETLIFY_PROXY_SIGNING_SECRET: undefined,
      }),
    ).rejects.toThrow('SIGNED_PROXY_CONFIGURATION_REQUIRED');
  });
  for (const [name, value] of [
    ['malformed', 'not-a-jws'],
    ['extra segment', `${token()}.extra`],
    ['wrong issuer', token({ iss: 'attacker' })],
    ['wrong site', token({ site_url: 'https://another.netlify.app' })],
    ['wrong site id', token({ netlify_id: 'another-site' })],
    ['wrong deploy context', token({ deploy_context: 'deploy-preview' })],
    ['missing expiration', token({ exp: undefined })],
    [
      'string expiration',
      token({ exp: String(Math.floor(Date.now() / 1000) + 60) }),
    ],
    [
      'fractional expiration',
      token({ exp: Math.floor(Date.now() / 1000) + 60.5 }),
    ],
    ['expired', token({ exp: Math.floor(Date.now() / 1000) - 1 })],
    [
      'excessive remaining lifetime',
      token({ exp: Math.floor(Date.now() / 1000) + 601 }),
    ],
    ['none algorithm', token({}, secret, { alg: 'none' })],
    ['asymmetric algorithm', token({}, secret, { alg: 'RS256' })],
    ['different HMAC algorithm', token({}, secret, { alg: 'HS512' })],
    [
      'unsupported critical header',
      token({}, secret, { alg: 'HS256', crit: ['custom'] }),
    ],
  ]) {
    it(`rejects ${name} before any authentication or database operation`, async () => {
      const { app, getSession, handler, connect } = await fixture();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { 'x-nf-sign': value, cookie: 'session=synthetic' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('PROXY_SIGNATURE_INVALID');
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(getSession).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
    });
  }

  it('rejects the retiring key after its cutoff while continuing to accept the current key', async () => {
    const previousSecret =
      'synthetic-previous-secret-longer-than-32-characters';
    const { app } = await fixture({
      ...env,
      NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET: previousSecret,
      PROXY_PREVIOUS_KEY_VALID_UNTIL: Math.floor(Date.now() / 1000) - 1,
    });
    const expired = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { 'x-nf-sign': token({}, previousSecret) },
    });
    expect(expired.statusCode).toBe(401);
    const current = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { 'x-nf-sign': token() },
    });
    expect(current.statusCode).toBe(204);
  });

  it('requires signatures for owner roots, encoded owner routes and cookies on other routes', async () => {
    const { app, getSession, handler } = await fixture();
    for (const url of [
      '/api/auth',
      '/api/v1',
      '/%61pi/v1/me',
      '/health/live',
      '/',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: 'session=synthetic' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('PROXY_SIGNATURE_REQUIRED');
    }
    expect(getSession).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    const probe = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: {
        'x-nf-client-connection-ip': '198.51.100.77',
        'x-forwarded-for': '198.51.100.88',
      },
    });
    expect(probe.statusCode).toBe(200);
  });

  it('trusts the Netlify IP only after signature validation and strips forwarding/signature headers before auth', async () => {
    const { app, handler } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: {
        'x-nf-sign': token(),
        'x-nf-client-connection-ip': '198.51.100.12',
        'x-forwarded-for': '203.0.113.1',
        forwarded: 'for=203.0.113.2',
        'x-forwarded-host': 'attacker.example.test',
        'x-forwarded-proto': 'http',
        'x-nthawi-client-ip': '203.0.113.3',
      },
    });
    expect(response.statusCode).toBe(204);
    const request = handler.mock.calls[0]![0];
    expect(request.headers.get('x-nthawi-client-ip')).toBe('198.51.100.12');
    for (const header of [
      'x-nf-sign',
      'x-nf-client-connection-ip',
      'forwarded',
      'x-forwarded-for',
      'x-forwarded-host',
      'x-forwarded-proto',
    ]) {
      expect(request.headers.has(header)).toBe(false);
    }
    expect(request.url).toBe('http://owner.example.test/api/auth/get-session');
  });

  it('falls back to the measured trust chain for an invalid Netlify IP', async () => {
    const { app, handler } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      remoteAddress: '192.0.2.44',
      headers: {
        'x-nf-sign': token(),
        'x-nf-client-connection-ip': '198.51.100.1,203.0.113.1',
        'x-forwarded-for': '203.0.113.1',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(handler.mock.calls[0]![0].headers.get('x-nthawi-client-ip')).toBe(
      '192.0.2.44',
    );
  });

  it('allows the retiring key only during an explicit bounded rotation overlap', async () => {
    const previousSecret =
      'synthetic-previous-secret-longer-than-32-characters';
    const { app, handler } = await fixture({
      ...env,
      NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET: previousSecret,
      PROXY_PREVIOUS_KEY_VALID_UNTIL: Math.floor(Date.now() / 1000) + 60,
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { 'x-nf-sign': token({}, previousSecret) },
    });
    expect(response.statusCode).toBe(204);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('rejects a forged proxy token before owner-session lookup', async () => {
    const { app, getSession, connect } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: {
        'x-nf-sign': token({}, 'forged-key'),
        cookie: 'session=synthetic',
      },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('PROXY_SIGNATURE_INVALID');
    expect(getSession).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('passes a valid native Netlify signature to Better Auth without requiring iat', async () => {
    const { app, handler } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { 'x-nf-sign': token() },
    });
    expect(response.statusCode).toBe(204);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('refuses unsigned auth before invoking Better Auth or a database', async () => {
    const { app, handler, connect } = await fixture();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email?private=sentinel',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'test@example.test' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: 'PROXY_SIGNATURE_REQUIRED',
      message: 'A valid signed proxy request is required.',
      correlationId: expect.any(String),
    });
    expect(response.body).not.toContain('sentinel');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(handler).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
});
