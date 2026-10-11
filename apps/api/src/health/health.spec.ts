import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadinessService } from './health.js';

vi.mock('@nthawi/db', () => ({ probeDatabase: vi.fn() }));
afterEach(() => vi.useRealTimers());

describe('bounded readiness', () => {
  it('shares pending work even after each HTTP deadline and permits retry after settlement', async () => {
    vi.useFakeTimers();
    let settle!: () => void;
    const probe = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const service = new ReadinessService(probe);
    const first = expect(service.check(20)).rejects.toMatchObject({
      status: 503,
    });
    const second = expect(service.check(20)).rejects.toMatchObject({
      status: 503,
    });
    await vi.advanceTimersByTimeAsync(20);
    await Promise.all([first, second]);
    const third = expect(service.check(20)).rejects.toMatchObject({
      status: 503,
    });
    await vi.advanceTimersByTimeAsync(20);
    await third;
    expect(probe).toHaveBeenCalledOnce();
    settle();
    await vi.advanceTimersByTimeAsync(0);
    probe.mockResolvedValue(undefined);
    await service.check(20);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sanitizes database failures and permits subsequent successful probes', async () => {
    const probe = vi
      .fn()
      .mockRejectedValueOnce(new Error('private-password'))
      .mockResolvedValue(undefined);
    const service = new ReadinessService(probe);
    await expect(service.check()).rejects.toMatchObject({
      response: {
        status: 'not_ready',
        code: 'API_NOT_READY',
      },
    });
    await expect(service.check()).resolves.toBeUndefined();
  });
});
