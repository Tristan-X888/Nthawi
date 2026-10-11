import type { BetterAuthOptions } from 'better-auth';

/** Better Auth diagnostics can include SQL parameters, cookies and provider keys. */
export const authLogger: NonNullable<BetterAuthOptions['logger']> = {
  level: 'warn',
  log(level) {
    if (level === 'error') console.error('AUTH_SERVICE_ERROR');
    else if (level === 'warn') console.warn('AUTH_SERVICE_WARNING');
  },
};
