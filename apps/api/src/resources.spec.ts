import { describe, expect, it, vi } from 'vitest';
import type { DatabaseHandle } from '@nthawi/db';
import { createApiResources, warmApiDatabases } from './resources.js';

describe('API resource cleanup', () => {
  it('warms both runtime logins concurrently and releases each acquired client', async () => {
    let finishAuth!: (client: { release: () => void }) => void;
    const authRelease = vi.fn();
    const businessRelease = vi.fn();
    const authConnect = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAuth = resolve;
        }),
    );
    const businessConnect = vi
      .fn()
      .mockResolvedValue({ release: businessRelease });
    const resources = createApiResources(
      { pool: { connect: authConnect } } as unknown as DatabaseHandle,
      { pool: { connect: businessConnect } } as unknown as DatabaseHandle,
    );
    const warming = warmApiDatabases(resources);
    await Promise.resolve();
    expect(authConnect).toHaveBeenCalledOnce();
    expect(businessConnect).toHaveBeenCalledOnce();
    expect(businessRelease).toHaveBeenCalledOnce();
    finishAuth({ release: authRelease });
    await warming;
    expect(authRelease).toHaveBeenCalledOnce();
  });

  it('sanitizes warmup failure while releasing the other runtime connection', async () => {
    const release = vi.fn();
    const resources = createApiResources(
      {
        pool: {
          connect: vi.fn().mockRejectedValue(new Error('private-password')),
        },
      } as unknown as DatabaseHandle,
      {
        pool: { connect: vi.fn().mockResolvedValue({ release }) },
      } as unknown as DatabaseHandle,
    );
    await expect(warmApiDatabases(resources)).rejects.toThrow(
      'Database connection warmup failed.',
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it('closes both pools once even if the first pool fails', async () => {
    const authEnd = vi.fn().mockRejectedValue(new Error('private-password'));
    const businessEnd = vi.fn().mockResolvedValue(undefined);
    const resources = createApiResources(
      { pool: { end: authEnd } } as unknown as DatabaseHandle,
      { pool: { end: businessEnd } } as unknown as DatabaseHandle,
    );
    const first = resources.close();
    expect(resources.close()).toBe(first);
    await expect(first).rejects.toThrow(
      'Database resources could not be closed.',
    );
    expect(authEnd).toHaveBeenCalledOnce();
    expect(businessEnd).toHaveBeenCalledOnce();
  });
});
