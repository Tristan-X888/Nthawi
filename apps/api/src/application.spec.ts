import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { probeDatabase, type DatabaseHandle } from '@nthawi/db';
import { loadServerEnv } from '@nthawi/tooling/env';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApplication } from './application.js';

vi.mock('@nthawi/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nthawi/db')>()),
  probeDatabase: vi.fn(),
}));
const applications: NestFastifyApplication[] = [];
afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
  vi.mocked(probeDatabase).mockReset();
});

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

async function fixture() {
  const getSession = vi.fn().mockResolvedValue(null);
  const close = vi.fn().mockResolvedValue(undefined);
  const resources = {
    authDatabase: { db: {} } as DatabaseHandle,
    applicationDatabase: { db: {} } as DatabaseHandle,
    close,
  };
  const app = await createApiApplication({
    env,
    resources,
    auth: {
      handler: async () => new Response(null, { status: 204 }),
      api: { getSession },
    },
    logger: false,
  });
  applications.push(app);
  return { app, resources, getSession, close };
}

describe('shared API composition', () => {
  it('sets no-store on decoded health routes, including readiness failures', async () => {
    const { app } = await fixture();
    vi.mocked(probeDatabase).mockResolvedValue(undefined);
    for (const url of ['/%68ealth/live', '/%68ealth/ready']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    vi.mocked(probeDatabase).mockRejectedValue(
      new Error('synthetic database failure'),
    );
    const failed = await app.inject({ method: 'GET', url: '/%68ealth/ready' });
    expect(failed.statusCode).toBe(503);
    expect(failed.headers['cache-control']).toBe('no-store');
  });

  it('serves root and liveness without database access and closes resources once', async () => {
    const { app, close } = await fixture();
    expect((await app.inject({ method: 'GET', url: '/' })).body).toBe(
      'Hello World!',
    );
    const live = await app.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'ok' });
    expect(live.headers['cache-control']).toBe('no-store');
    expect(probeDatabase).not.toHaveBeenCalled();
    await app.close();
    await app.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('probes both capabilities and sets no-store on readiness success and failure', async () => {
    const { app, resources } = await fixture();
    vi.mocked(probeDatabase).mockResolvedValue(undefined);
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready' });
    expect(ready.headers['cache-control']).toBe('no-store');
    expect(probeDatabase).toHaveBeenCalledWith(resources.authDatabase, 'auth');
    expect(probeDatabase).toHaveBeenCalledWith(
      resources.applicationDatabase,
      'business',
    );
    vi.mocked(probeDatabase).mockRejectedValue(
      new Error('postgresql://private-password'),
    );
    const failed = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(failed.statusCode).toBe(503);
    expect(failed.json()).toEqual({
      status: 'not_ready',
      code: 'API_NOT_READY',
    });
    expect(failed.headers['cache-control']).toBe('no-store');
    expect(failed.body).not.toContain('private-password');
  });

  it('rejects invalid origins before sessions and puts no-store on owner errors and success', async () => {
    const { app, getSession } = await fixture();
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { origin: env.WIDGET_ORIGIN },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.headers['cache-control']).toBe('no-store');
    expect(getSession).not.toHaveBeenCalled();
    const missing = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(missing.statusCode).toBe(401);
    expect(missing.headers['cache-control']).toBe('no-store');
    getSession.mockResolvedValue({
      user: {
        id: 'owner',
        name: 'Owner',
        email: 'owner@example.test',
        emailVerified: true,
      },
      session: {
        userId: 'owner',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        token: 'private-token',
      },
    });
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: 'session=synthetic', 'x-forwarded-for': '192.0.2.1' },
    });
    expect(me.statusCode).toBe(200);
    expect(me.headers['cache-control']).toBe('no-store');
    expect(me.body).not.toContain('private-token');
    expect([...getSession.mock.lastCall![0].headers]).toEqual([
      ['cookie', 'session=synthetic'],
    ]);
  });

  it('closes resources after application construction fails', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const resources = {
      authDatabase: {} as DatabaseHandle,
      applicationDatabase: { db: {} } as DatabaseHandle,
      close,
    };
    vi.spyOn(NestFactory, 'create').mockRejectedValueOnce(
      new Error('construction failed'),
    );
    await expect(
      createApiApplication({
        env,
        resources,
        auth: {
          handler: async () => new Response(),
          api: { getSession: async () => null },
        },
        logger: false,
      }),
    ).rejects.toThrow('construction failed');
    expect(close).toHaveBeenCalledOnce();
  });
});
