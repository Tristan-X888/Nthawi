import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDatabase } from '@nthawi/db';
import { loadServerEnv } from '@nthawi/tooling/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createApiApplication,
  createApiResources,
  type ApiResources,
} from '../src/application.js';

describe('Application composition on Fastify', () => {
  let app: NestFastifyApplication | undefined;
  let resources: ApiResources;

  beforeEach(async () => {
    const env = loadServerEnv({
      NODE_ENV: 'test',
      WEB_ORIGIN: 'http://localhost:3000',
      WIDGET_ORIGIN: 'http://localhost:5173',
      BETTER_AUTH_URL: 'http://localhost:4000',
      BETTER_AUTH_SECRET: 'synthetic-e2e-secret-at-least-32-characters',
      DATABASE_URL: 'postgresql://business:test@127.0.0.1:1/test',
      AUTH_DATABASE_URL: 'postgresql://identity:test@127.0.0.1:1/test',
      GOOGLE_CLIENT_ID: 'synthetic-google-client',
      GOOGLE_CLIENT_SECRET: 'synthetic-google-secret',
      RESEND_API_KEY: 'synthetic-resend-key',
      EMAIL_FROM: 'Nthawi <auth@example.test>',
      OPENAI_API_KEY: 'synthetic-openai-key',
    });
    // Root HTTP/lifecycle checks use lazy pools and need no running database.
    resources = createApiResources(
      createDatabase(env.AUTH_DATABASE_URL),
      createDatabase(env.DATABASE_URL),
    );
    app = await createApiApplication({
      env,
      resources,
      auth: {
        handler: async () => Response.json({}),
        api: { getSession: async () => null },
      },
      logger: false,
    });
  });

  afterEach(async () => {
    try {
      await app?.close();
    } finally {
      await resources?.close();
      app = undefined;
    }
  });

  it('serves the existing controller through Fastify', async () => {
    const response = await app!.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Hello World!');
  });

  it('closes both database pools once on application shutdown', async () => {
    const closeAuth = vi.spyOn(resources.authDatabase.pool, 'end');
    const closeBusiness = vi.spyOn(resources.applicationDatabase.pool, 'end');
    await app!.close();
    await resources.close();
    app = undefined;
    expect(closeAuth).toHaveBeenCalledOnce();
    expect(closeBusiness).toHaveBeenCalledOnce();
  });

  it('keeps liveness available while disconnected readiness fails safely', async () => {
    const live = await app!.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'ok' });
    const ready = await app!.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({
      status: 'not_ready',
      code: 'API_NOT_READY',
    });
    expect(ready.headers['cache-control']).toBe('no-store');
  });
});
