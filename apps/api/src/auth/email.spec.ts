import { describe, expect, it, vi } from 'vitest';
import { createAuthEmailSender } from './email.js';

const env = {
  RESEND_API_KEY: 'private-test-key',
  EMAIL_FROM: 'Nthawi <auth@example.test>',
};
const message = {
  to: 'owner@example.test',
  subject: 'Verification',
  text: 'secret-code-123456',
};

describe('authentication email delivery', () => {
  it('sends plain-text mail through the fixed Resend endpoint', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    await createAuthEmailSender(env, request)(message);
    expect(request).toHaveBeenCalledOnce();
    const [url, options] = request.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toEqual({
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    });
    expect(typeof options?.body).toBe('string');
    expect(JSON.parse(options?.body as string)).toEqual({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not expose provider response bodies or email contents on rejection', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('private-test-key secret-code-123456 owner@example.test', {
        status: 403,
      }),
    );
    await expect(createAuthEmailSender(env, request)(message)).rejects.toEqual(
      new Error('Authentication email delivery failed'),
    );
  });

  it('does not retain sensitive network failures in the error cause', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('private-test-key secret-code-123456'));
    try {
      await createAuthEmailSender(env, request)(message);
      expect.fail('request should fail');
    } catch (error) {
      expect(error).toEqual(new Error('Authentication email delivery failed'));
      expect((error as Error).cause).toBeUndefined();
    }
  });
});
