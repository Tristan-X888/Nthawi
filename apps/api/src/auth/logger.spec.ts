import { afterEach, describe, expect, it, vi } from 'vitest';
import { authLogger } from './logger.js';

afterEach(() => vi.restoreAllMocks());
describe('sanitized authentication diagnostics', () => {
  it('retains fixed severity events without forwarding diagnostic messages or error data', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    authLogger.log!(
      'error',
      'SQL token=private-token',
      new Error('postgres://private-password'),
    );
    authLogger.log!('warn', 'cookie=session-secret', {
      secret: 'provider-key',
    });
    expect(error).toHaveBeenCalledWith('AUTH_SERVICE_ERROR');
    expect(warn).toHaveBeenCalledWith('AUTH_SERVICE_WARNING');
    expect(
      JSON.stringify([...error.mock.calls, ...warn.mock.calls]),
    ).not.toMatch(/private|secret|provider/);
  });
});
