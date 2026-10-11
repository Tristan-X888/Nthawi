import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OwnerGuard, OwnerSessionService } from './owner-session.js';

function fixture(method: string, origin?: string) {
  const read = vi.fn().mockResolvedValue({ owner: { id: 'owner' } });
  const header = vi.fn();
  const request = { method, headers: origin === undefined ? {} : { origin } };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ header }),
    }),
  } as unknown as ExecutionContext;
  const guard = new OwnerGuard({ read } as unknown as OwnerSessionService, [
    'https://owner.example.test',
  ]);
  return { guard, context, request, read, header };
}

describe('owner origin guard', () => {
  it.each([
    'https://widget.example.test',
    'https://attacker.example.test',
    'null',
  ])(
    'rejects supplied untrusted origin %s before reading a session',
    async (origin) => {
      const { guard, context, read, header } = fixture('GET', origin);
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: 403,
      });
      expect(read).not.toHaveBeenCalled();
      expect(header).toHaveBeenCalledWith('cache-control', 'no-store');
    },
  );

  it.each(['POST', 'PATCH', 'DELETE', 'PUT'])(
    'requires Origin for unsafe %s owner requests',
    async (method) => {
      const { guard, context, read } = fixture(method);
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: 403,
      });
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['GET', undefined],
    ['POST', 'https://owner.example.test'],
  ])(
    'allows %s with valid session and suitable origin',
    async (method, origin) => {
      const { guard, context, request, read } = fixture(method!, origin);
      expect(await guard.canActivate(context)).toBe(true);
      expect(read).toHaveBeenCalledOnce();
      expect(request).toHaveProperty('ownerSession.owner.id', 'owner');
    },
  );
});
