import fastifyCors from '@fastify/cors';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { getAllowedAuthOrigins, type ServerEnv } from '@nthawi/tooling/env';
import type { NthawiAuth } from './create-auth.js';
import { AUTH_CLIENT_IP_HEADER } from './http.constants.js';

// Register before app.init()/listen(). Auth owns its body parsing inside this
// Fastify scope; Nest retains its normal parsers for business controllers.
export async function configureAuthHttp(
  app: NestFastifyApplication,
  auth: Pick<NthawiAuth, 'handler'>,
  env: Pick<
    ServerEnv,
    'WEB_ORIGIN' | 'AUTH_TRUSTED_ORIGINS' | 'BETTER_AUTH_URL'
  >,
): Promise<void> {
  const fastify: FastifyInstance = app.getHttpAdapter().getInstance();
  const allowedOrigins = getAllowedAuthOrigins(env);
  await fastify.register(fastifyCors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key'],
  });

  await fastify.register(async (router) => {
    router.addHook('onRequest', async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const origin = request.headers.origin;
      // CORS restricts response access; this guard also rejects cookie-free
      // requests from other origins. OAuth and server clients can omit Origin.
      if (
        origin &&
        !allowedOrigins.includes(origin) &&
        origin !== env.BETTER_AUTH_URL
      ) {
        return reply
          .code(403)
          .send({ code: 'INVALID_ORIGIN', message: 'Invalid origin' });
      }
    });

    router.removeAllContentTypeParsers();
    router.addContentTypeParser(
      ['application/json', 'application/x-www-form-urlencoded'],
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );

    router.route<{ Body: Buffer | undefined }>({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      bodyLimit: 1024 * 1024,
      async handler(request, reply) {
        try {
          // The configured public origin is authoritative. Host and forwarded
          // host/protocol headers must not influence OAuth callback URLs.
          const url = new URL(`${env.BETTER_AUTH_URL}${request.url}`);
          const headers = fromNodeHeaders(request.headers);
          headers.set('host', url.host);
          for (const header of [
            'forwarded',
            'x-forwarded-host',
            'x-forwarded-proto',
            'x-forwarded-for',
            'x-real-ip',
          ]) {
            headers.delete(header);
          }
          // Fastify resolves request.ip using the configured proxy allowlist.
          // Overwrite even a supplied internal header before Better Auth sees it.
          headers.set(AUTH_CLIENT_IP_HEADER, request.ip);
          const response = await auth.handler(
            new Request(url, {
              method: request.method,
              headers,
              ...(request.method !== 'GET' &&
              request.method !== 'HEAD' &&
              request.body !== undefined
                ? { body: new Uint8Array(request.body) }
                : {}),
            }),
          );

          // Read before setting reply headers so failures produce a clean 500.
          const body = response.body
            ? Buffer.from(await response.arrayBuffer())
            : undefined;
          reply.code(response.status);
          response.headers.forEach((value, key) => {
            if (
              ![
                'set-cookie',
                'content-length',
                'transfer-encoding',
                'connection',
              ].includes(key)
            ) {
              reply.header(key, value);
            }
          });
          const cookies = response.headers.getSetCookie();
          if (cookies.length > 0) reply.header('set-cookie', cookies);
          reply.header('cache-control', 'no-store');
          return reply.send(body);
        } catch {
          // Error messages, URLs, bodies and headers can contain credentials.
          request.log.error(
            { requestId: request.id },
            'Authentication request failed',
          );
          return reply
            .code(500)
            .send({ code: 'AUTH_FAILURE', message: 'Authentication failed.' });
        }
      },
    });
  });
}
