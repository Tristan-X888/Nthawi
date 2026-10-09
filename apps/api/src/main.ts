import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { auth, authDatabase, serverEnv } from './auth/auth.js';
import { configureAuthHttp } from './auth/http.js';

async function bootstrap(): Promise<void> {
  let app: NestFastifyApplication | undefined;
  try {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule.withAuthDatabase(authDatabase),
      new FastifyAdapter({
        trustProxy:
          serverEnv.API_TRUST_PROXY.length > 0
            ? serverEnv.API_TRUST_PROXY
            : false,
        // Automatic request logs can contain OAuth codes in query strings.
        logger: true,
        disableRequestLogging: true,
      }),
      { abortOnError: false },
    );
    await configureAuthHttp(app, auth, serverEnv);
    app.enableShutdownHooks();
    await app.listen({ host: '0.0.0.0', port: serverEnv.API_PORT });
  } catch (error) {
    if (app) await app.close();
    else await authDatabase.pool.end();
    throw error;
  }
}
await bootstrap();
