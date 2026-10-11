import type { DatabaseHandle } from '@nthawi/db';

export interface ApiResources {
  authDatabase: DatabaseHandle;
  applicationDatabase: DatabaseHandle;
  close(): Promise<void>;
}

export function createApiResources(
  authDatabase: DatabaseHandle,
  applicationDatabase: DatabaseHandle,
): ApiResources {
  let closing: Promise<void> | undefined;
  return {
    authDatabase,
    applicationDatabase,
    close() {
      closing ??= (async () => {
        const results = await Promise.allSettled(
          [...new Set([authDatabase.pool, applicationDatabase.pool])].map(
            (pool) => Promise.resolve().then(() => pool.end()),
          ),
        );
        if (results.some((result) => result.status === 'rejected')) {
          throw new Error('Database resources could not be closed.');
        }
      })();
      return closing;
    },
  };
}
