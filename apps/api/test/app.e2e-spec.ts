import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { createDatabase } from '@nthawi/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';

describe('AppModule on Fastify', () => {
  let app: NestFastifyApplication | undefined;
  let database: ReturnType<typeof createDatabase>;

  beforeEach(async () => {
    // Pool construction is lazy. These HTTP/lifecycle tests do not query a DB.
    database = createDatabase('postgresql://test:test@127.0.0.1:1/test');
    const fixture = await Test.createTestingModule({
      imports: [AppModule.withAuthDatabase(database)],
    }).compile();
    app = fixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
      { logger: false },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('serves the existing controller through Fastify', async () => {
    const response = await app!.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Hello World!');
  });

  it('closes the shared database pool on application shutdown', async () => {
    const closePool = vi.spyOn(database.pool, 'end');
    await app!.close();
    app = undefined;
    expect(closePool).toHaveBeenCalledOnce();
  });
});
