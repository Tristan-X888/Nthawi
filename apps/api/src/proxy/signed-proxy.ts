import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { FastifyInstance } from 'fastify';
import {
  isDeployedOwnerEnvironment,
  type ServerEnv,
} from '@nthawi/tooling/env';

// Native Netlify JWS has exp but no issued-at claim. Bound remaining lifetime;
// this is not a claim that a native token's original issue time is observable.
const MAX_TOKEN_REMAINING_SECONDS = 300;

function isOwnerRoute(url: string): boolean {
  let pathname = url.split('?')[0] ?? '';
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // The router rejects malformed paths. Cookies still require signatures.
  }
  return /^\/api\/(?:auth|v1)(?:\/|$)/.test(pathname);
}

function decodeObject(value: string): Record<string, unknown> | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return;
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) return;
  const parsed: unknown = JSON.parse(bytes.toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
  return parsed as Record<string, unknown>;
}

function validSignature(value: string | string[], env: ServerEnv): boolean {
  if (typeof value !== 'string' || value.length > 8192) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [encodedHeader, encodedClaims, encodedSignature] = parts as [
    string,
    string,
    string,
  ];
  try {
    const header = decodeObject(encodedHeader);
    if (
      header?.alg !== 'HS256' ||
      header.crit !== undefined ||
      header.b64 !== undefined
    )
      return false;
    if (!/^[A-Za-z0-9_-]{43}$/.test(encodedSignature)) return false;
    const signature = Buffer.from(encodedSignature, 'base64url');
    if (signature.toString('base64url') !== encodedSignature) return false;
    const now = Math.floor(Date.now() / 1000);
    const keys = [env.NETLIFY_PROXY_SIGNING_SECRET!];
    if (
      env.NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET &&
      env.PROXY_PREVIOUS_KEY_VALID_UNTIL !== undefined &&
      env.PROXY_PREVIOUS_KEY_VALID_UNTIL > now &&
      env.PROXY_PREVIOUS_KEY_VALID_UNTIL <= now + 3600
    )
      keys.push(env.NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET);
    let matched = false;
    for (const key of keys) {
      const expected = createHmac('sha256', key)
        .update(`${encodedHeader}.${encodedClaims}`)
        .digest();
      matched =
        (signature.length === expected.length &&
          timingSafeEqual(signature, expected)) ||
        matched;
    }
    if (!matched) return false;
    const claims = decodeObject(encodedClaims);
    return (
      claims?.iss === 'netlify' &&
      Number.isSafeInteger(claims.exp) &&
      (claims.exp as number) > now &&
      (claims.exp as number) <= now + MAX_TOKEN_REMAINING_SECONDS &&
      claims.site_url === env.PROXY_EXPECTED_SITE_URL &&
      claims.netlify_id === env.PROXY_EXPECTED_NETLIFY_ID &&
      claims.deploy_context === env.PROXY_EXPECTED_DEPLOY_CONTEXT
    );
  } catch {
    return false;
  }
}

/** Installed before auth/router hooks so rejected ingress performs no DB work. */
export function configureSignedProxy(fastify: FastifyInstance, env: ServerEnv) {
  if (
    isDeployedOwnerEnvironment(env) &&
    (!env.NETLIFY_PROXY_SIGNING_SECRET ||
      !env.PROXY_EXPECTED_SITE_URL ||
      !env.PROXY_EXPECTED_NETLIFY_ID ||
      !env.PROXY_EXPECTED_DEPLOY_CONTEXT)
  )
    throw new Error('SIGNED_PROXY_CONFIGURATION_REQUIRED');
  if (!env.NETLIFY_PROXY_SIGNING_SECRET) return;
  fastify.addHook('onSend', async (request, reply, payload) => {
    if (env.WEB_ORIGIN === 'https://app-staging.nthawi.io') {
      reply.header('x-robots-tag', 'noindex, nofollow, noarchive');
    }
    reply.header('x-content-type-options', 'nosniff');
    if (
      /\bapplication\/(?:[\w.-]+\+)?json\b/i.test(
        String(reply.getHeader('content-type') ?? ''),
      )
    ) {
      reply.header(
        'content-security-policy',
        "default-src 'none'; frame-ancestors 'none'",
      );
    }
    // Profile A forbids credentialed CORS. Owner requests use the same-origin
    // Netlify proxy, so no CORS response headers belong on those routes.
    reply.removeHeader('access-control-allow-credentials');
    if (isOwnerRoute(request.url) || request.headers.cookie) {
      reply.header('cache-control', 'private, no-store');
      reply.removeHeader('etag');
      reply.removeHeader('last-modified');
      for (const name of Object.keys(reply.getHeaders())) {
        if (name.startsWith('access-control-')) reply.removeHeader(name);
      }
    }
    return payload;
  });
  fastify.addHook('onRequest', async (request, reply) => {
    const ownerRoute = isOwnerRoute(request.url);
    const signature = request.headers['x-nf-sign'];
    const signed = signature !== undefined && validSignature(signature, env);
    // Resolve the measured allowlisted chain before deleting spoofable headers.
    const connectionIp = request.ip;
    const netlifyIp = request.headers['x-nf-client-connection-ip'];
    for (const name of Object.keys(request.headers)) {
      if (
        name === 'forwarded' ||
        name.startsWith('x-forwarded-') ||
        [
          'x-real-ip',
          'x-nf-client-connection-ip',
          'netlify-client-ip',
          'x-nthawi-client-ip',
          'x-nf-sign',
        ].includes(name)
      )
        delete request.headers[name];
    }
    Object.defineProperty(request, 'ip', {
      value:
        signed && typeof netlifyIp === 'string' && isIP(netlifyIp) !== 0
          ? netlifyIp
          : connectionIp,
      configurable: true,
    });
    if (
      (ownerRoute || request.headers.cookie || signature !== undefined) &&
      !signed
    ) {
      return reply
        .header('cache-control', 'no-store')
        .code(401)
        .send({
          code:
            signature === undefined
              ? 'PROXY_SIGNATURE_REQUIRED'
              : 'PROXY_SIGNATURE_INVALID',
          message: 'A valid signed proxy request is required.',
          correlationId: request.id,
        });
    }
  });
}
