import { NestFactory } from '@nestjs/core';
import type { NestApplicationOptions } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { ServerEnv } from '@nthawi/tooling/env';
import { LogController } from 'fastify';
import { AppModule } from './app.module.js';
import { configureAuthHttp } from './auth/http.js';
import type { ApiAuth } from './auth/owner-session.js';
import type { ApiResources } from './resources.js';

export interface ApiApplicationOptions {
  env: ServerEnv;
  auth: ApiAuth;
  resources: ApiResources;
  logger?: NestApplicationOptions['logger'];
}

/** Shared production and integration composition. Never loads local environment. */
export async function createApiApplication({
  env,
  auth,
  resources,
  logger,
}: ApiApplicationOptions): Promise<NestFastifyApplication> {
  let app: NestFastifyApplication | undefined;
  let closing: Promise<void> | undefined;
  const managedResources: ApiResources = {
    ...resources,
    close: () => {
      closing ??= Promise.resolve().then(() => resources.close());
      return closing;
    },
  };
  try {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule.configure(env, auth, managedResources),
      new FastifyAdapter({
        trustProxy:
          env.API_TRUST_PROXY.length > 0 ? env.API_TRUST_PROXY : false,
        // Query strings can contain OAuth credentials. Disable automatic logs.
        logger: logger !== false,
        logController: new LogController({ disableRequestLogging: true }),
      }),
      { abortOnError: false, ...(logger !== undefined ? { logger } : {}) },
    );
    app.getHttpAdapter().getInstance().decorateRequest('ownerSession', null);
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', async (request, reply) => {
        const pathname = request.url.split('?')[0];
        if (
          pathname?.startsWith('/api/v1/') ||
          pathname?.startsWith('/api/auth/') ||
          pathname?.startsWith('/health/')
        ) {
          reply.header('cache-control', 'no-store');
        }
      });
    await configureAuthHttp(app, auth, env);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  } catch (error) {
    try {
      await app?.close();
    } catch {
      /* Preserve the original startup failure. */
    } finally {
      try {
        await managedResources.close();
      } catch {
        /* Both pool closures were attempted. */
      }
    }
    throw error;
  }
}

export { createApiResources, type ApiResources } from './resources.js';
export type { ApiAuth } from './auth/owner-session.js';
