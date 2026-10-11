import { describe, expect, it, vi } from 'vitest';
import { OwnerSessionService, type SessionAuthority } from './owner-session.js';

const session = () => ({
  user: {
    id: 'owner-id',
    name: 'Owner',
    email: 'owner@example.test',
    emailVerified: true,
  },
  session: {
    userId: 'owner-id',
    createdAt: new Date('2026-10-10T10:00:00Z'),
    expiresAt: new Date('2026-10-11T10:00:00Z'),
  },
});

describe('authoritative owner sessions', () => {
  it('bounds session freshness by expiry for short-lived sessions', async () => {
    const value = session();
    value.session.expiresAt = new Date('2026-10-10T10:06:00Z');
    const reader = new OwnerSessionService({
      getSession: vi.fn().mockResolvedValue(value),
    });
    const result = await reader.read(
      new Headers(),
      new Date('2026-10-10T10:05:00Z'),
    );
    expect(result.session.freshUntil).toBe('2026-10-10T10:06:00.000Z');
  });
  it('bypasses cookie caches and refresh, and projects only browser-safe fields', async () => {
    const getSession = vi
      .fn()
      .mockResolvedValue({ ...session(), token: 'secret' });
    const reader = new OwnerSessionService({ getSession } as SessionAuthority);
    const headers = new Headers({ cookie: 'session=secret' });
    const result = await reader.read(headers, new Date('2026-10-10T10:05:00Z'));
    expect(getSession).toHaveBeenCalledWith({
      headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
    expect(result).toEqual({
      owner: session().user,
      session: {
        createdAt: '2026-10-10T10:00:00.000Z',
        expiresAt: '2026-10-11T10:00:00.000Z',
        freshUntil: '2026-10-10T10:15:00.000Z',
      },
    });
  });

  it.each([
    null,
    {
      ...session(),
      session: { ...session().session, expiresAt: new Date('2026-10-09') },
    },
    { ...session(), session: { ...session().session, userId: 'other-owner' } },
  ])('rejects missing, expired or inconsistent sessions', async (result) => {
    const reader = new OwnerSessionService({
      getSession: vi.fn().mockResolvedValue(result),
    } as SessionAuthority);
    await expect(
      reader.read(new Headers(), new Date('2026-10-10T10:05:00Z')),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects unverified owners', async () => {
    const reader = new OwnerSessionService({
      getSession: vi.fn().mockResolvedValue({
        ...session(),
        user: { ...session().user, emailVerified: false },
      }),
    } as SessionAuthority);
    await expect(
      reader.read(new Headers(), new Date('2026-10-10T10:05:00Z')),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('sanitizes session database failures', async () => {
    const reader = new OwnerSessionService({
      getSession: vi
        .fn()
        .mockRejectedValue(new Error('postgres://private-password')),
    } as SessionAuthority);
    await expect(reader.read(new Headers())).rejects.toMatchObject({
      status: 503,
      response: {
        code: 'AUTH_UNAVAILABLE',
        message: 'Authentication temporarily unavailable.',
      },
    });
  });
});
