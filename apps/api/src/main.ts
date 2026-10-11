import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { auth, resources, serverEnv } from './auth/auth.js';
import { createApiApplication } from './application.js';

async function bootstrap(): Promise<void> {
  let app: NestFastifyApplication | undefined;
  try {
    app = await createApiApplication({ env: serverEnv, auth, resources });
    app.enableShutdownHooks();
    await app.listen({ host: '0.0.0.0', port: serverEnv.API_PORT });
  } catch (error) {
    try {
      await app?.close();
    } finally {
      await resources.close();
    }
    throw error;
  }
}
await bootstrap();
