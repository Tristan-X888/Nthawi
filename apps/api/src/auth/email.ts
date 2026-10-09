import type { ServerEnv } from '@nthawi/tooling/env';

export interface AuthEmail {
  to: string;
  subject: string;
  text: string;
}
export type SendAuthEmail = (message: AuthEmail) => Promise<void>;

export function createAuthEmailSender(
  env: Pick<ServerEnv, 'RESEND_API_KEY' | 'EMAIL_FROM'>,
  request: typeof fetch = fetch,
): SendAuthEmail {
  return async (message) => {
    try {
      const response = await request('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('Resend rejected the request');
      await response.body?.cancel();
    } catch {
      // Provider responses, recipients, tokens and network errors stay private.
      throw new Error('Authentication email delivery failed');
    }
  };
}
