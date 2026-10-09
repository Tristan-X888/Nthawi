import { Test, type TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppController } from '../app.controller.js';
import { AppService } from '../app.service.js';
import { configureAuthHttp } from './http.js';

const env = {
  WEB_ORIGIN: 'https://owner.example.test',
  AUTH_TRUSTED_ORIGINS: [] as string[],
  BETTER_AUTH_URL: 'https://api.example.test',
};
const apps: NestFastifyApplication[] = [];
let testModule: TestingModule | undefined;

beforeEach(async () => {
  testModule = undefined;
  testModule = await Test.createTestingModule({
    controllers: [AppController],
    providers: [AppService],
  }).compile();
});

async function fixture(
  handler: (request: Request) => Promise<Response>,
  trustProxy: false | string[] = false,
  trustedOrigins: string[] = [],
) {
  if (!testModule) {
    throw new Error(
      'The test module must be initialized before creating an app.',
    );
  }

  const app = testModule.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ trustProxy, logger: false }),
    { logger: false },
  );
  apps.push(app);
  await configureAuthHttp(
    app,
    { handler },
    {
      ...env,
      AUTH_TRUSTED_ORIGINS: trustedOrigins,
    },
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

afterEach(async () => {
  const createdApps = apps.splice(0);
  const module = testModule;
  testModule = undefined;

  if (createdApps.length > 0) {
    await Promise.all(createdApps.map((app) => app.close()));
  } else {
    await module?.close();
  }
});

describe('Fastify authentication bridge', () => {
  it('uses the configured API origin and preserves callback query parameters', async () => {
    const app = await fixture(async (request) =>
      Response.json({ url: request.url }),
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/callback/google?code=encoded%2Bcode&state=state-value',
      headers: {
        host: 'attacker.example.test',
        'x-forwarded-host': 'other.example.test',
        'x-forwarded-proto': 'http',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      url: 'https://api.example.test/api/auth/callback/google?code=encoded%2Bcode&state=state-value',
    });
  });

  it.each([
    'false',
    'null',
    '0',
    '{"name":"Moni 🌍","password":"space + value"}',
  ])('preserves the JSON request body %s', async (payload) => {
    const app = await fixture(async (request) =>
      Response.json({
        body: await request.text(),
        contentType: request.headers.get('content-type'),
      }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: env.WEB_ORIGIN, 'content-type': 'application/json' },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      body: payload,
      contentType: 'application/json',
    });
  });

  it('preserves form-encoded OAuth callback bodies', async () => {
    const app = await fixture(async (request) =>
      Response.json({ body: await request.text() }),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/callback/google',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'code=a%2Bb&state=c+d',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ body: 'code=a%2Bb&state=c+d' });
  });

  it('forwards separate cookies and redirects without merging cookie expiry commas', async () => {
    const cookies = [
      'session=abc; Path=/; HttpOnly; Secure',
      'state=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly',
    ];
    const app = await fixture(async () => {
      const headers = new Headers({ location: `${env.WEB_ORIGIN}/welcome` });
      for (const cookie of cookies) headers.append('set-cookie', cookie);
      return new Response(null, { status: 302, headers });
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/callback/google',
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      'https://owner.example.test/welcome',
    );
    expect(response.headers['set-cookie']).toEqual(cookies);
    expect(response.body).toBe('');
  });

  it('preserves empty responses and Better Auth error statuses', async () => {
    const app = await fixture(async (request) =>
      request.url.endsWith('/sign-out')
        ? new Response(null, { status: 204 })
        : Response.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 }),
    );
    const empty = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
    });
    expect(empty.statusCode).toBe(204);
    expect(empty.body).toBe('');
    const denied = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
    });
    expect(denied.statusCode).toBe(401);
    expect(denied.json()).toEqual({ code: 'INVALID_CREDENTIALS' });
  });

  it('allows credentialed owner preflight with the documented request headers', async () => {
    const app = await fixture(async () => Response.json({ ok: true }));
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/sign-in/email',
      headers: {
        origin: env.WEB_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers':
          'content-type,authorization,idempotency-key',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      env.WEB_ORIGIN,
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-headers']).toContain(
      'idempotency-key',
    );
  });

  it.each([
    'https://widget.example.test',
    'https://attacker.example.test',
    'null',
  ])(
    'rejects supplied untrusted origin %s before auth runs',
    async (origin) => {
      let reachedAuth = false;
      const app = await fixture(async () => {
        reachedAuth = true;
        return Response.json({ ok: true });
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { origin },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('INVALID_ORIGIN');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(reachedAuth).toBe(false);
    },
  );

  it('uses the socket IP when forwarding headers come from an untrusted peer', async () => {
    const app = await fixture(async (request) =>
      Response.json({ ip: request.headers.get('x-nthawi-client-ip') }),
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/ok',
      remoteAddress: '192.0.2.30',
      headers: {
        'x-forwarded-for': '198.51.100.42',
        'x-nthawi-client-ip': '203.0.113.99',
      },
    });
    expect(response.json()).toEqual({ ip: '192.0.2.30' });
  });

  it('uses the client IP resolved through an explicitly trusted proxy', async () => {
    const app = await fixture(
      async (request) =>
        Response.json({ ip: request.headers.get('x-nthawi-client-ip') }),
      ['127.0.0.1/32'],
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/ok',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.42' },
    });
    expect(response.json()).toEqual({ ip: '198.51.100.42' });
  });

  it('allows explicitly trusted browser tunnel origins for auth and preflight', async () => {
    const tunnelOrigin = 'https://owner.ngrok-free.app';
    let reachedAuth = false;
    const app = await fixture(
      async () => {
        reachedAuth = true;
        return Response.json({ ok: true });
      },
      false,
      [tunnelOrigin],
    );
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/sign-in/email',
      headers: {
        origin: tunnelOrigin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(tunnelOrigin);
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: tunnelOrigin },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(reachedAuth).toBe(true);
  });

  it('bounds auth bodies before invoking Better Auth', async () => {
    let reachedAuth = false;
    const app = await fixture(async () => {
      reachedAuth = true;
      return Response.json({ ok: true });
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: 'x'.repeat(1024 * 1024 + 1),
    });
    expect(response.statusCode).toBe(413);
    expect(reachedAuth).toBe(false);
  });

  it('returns a sanitized failure without leaking exceptions or request secrets', async () => {
    const app = await fixture(async () => {
      throw new Error('private-token password=user-password');
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { password: 'user-password' },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: 'AUTH_FAILURE',
      message: 'Authentication failed.',
    });
    expect(response.body).not.toContain('private-token');
    expect(response.body).not.toContain('user-password');
  });

  it('keeps regular Nest controllers reachable outside the auth scope', async () => {
    const app = await fixture(async () => Response.json({ ok: true }));
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Hello World!');
  });
});
