import { describe, expect, it, vi } from 'vitest';
import type { DatabaseHandle } from '@nthawi/db';
import { createApiResources } from './resources.js';

describe('API resource cleanup', () => {
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
