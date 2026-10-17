import type { DatabaseHandle } from '@nthawi/db';

export interface ApiResources {
  authDatabase: DatabaseHandle;
  applicationDatabase: DatabaseHandle;
  close(): Promise<void>;
}

// Establish each runtime login once after HTTP starts. Readiness can then use
// an idle connection without spending its schema-check deadline on TLS/login.
// Failure leaves liveness available and readiness continues to fail closed.
export async function warmApiDatabases(resources: ApiResources): Promise<void> {
  const results = await Promise.allSettled(
    [
      ...new Set([
        resources.authDatabase.pool,
        resources.applicationDatabase.pool,
      ]),
    ].map(async (pool) => {
      const client = await pool.connect();
      client.release();
    }),
  );
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Database connection warmup failed.');
  }
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
