import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { dash } from '@better-auth/infra';
import { emailOTP } from 'better-auth/plugins';
import type { AppDatabase } from '@nthawi/db';
import { getAllowedAuthOrigins, type ServerEnv } from '@nthawi/tooling/env';
import { createAuthEmailSender, type SendAuthEmail } from './email.js';
import { AUTH_CLIENT_IP_HEADER } from './http.constants.js';

export function createAuth(
  env: ServerEnv,
  database: AppDatabase,
  sendEmail: SendAuthEmail = createAuthEmailSender(env),
) {
  return betterAuth({
    appName: 'Nthawi',
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: getAllowedAuthOrigins(env),
    database: drizzleAdapter(database, { provider: 'pg', transaction: true }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    account: {
      accountLinking: {
        disableImplicitLinking: true,
        allowUnlinkingAll: false,
      },
    },
    user: {
      // Email changes use the OTP plugin below. The core link flow is not
      // compatible with overrideDefaultEmailVerification.
      changeEmail: { enabled: false },
      deleteUser: { enabled: true },
    },
    session: {
      freshAge: 60 * 15,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        await sendEmail({
          to: user.email,
          subject: 'Reset your Nthawi password',
          text: `Reset your Nthawi password using this link:\n\n${url}\n\nIf you did not request this, ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 3 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: [AUTH_CLIENT_IP_HEADER] },
      useSecureCookies: env.NODE_ENV === 'production',
      database: { generateId: 'uuid' },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        overrideDefaultEmailVerification: true,
        changeEmail: { enabled: true },
        async sendVerificationOTP({ email, otp, type }) {
          const purpose = {
            'sign-in': 'sign in to Nthawi',
            'email-verification': 'verify your Nthawi email',
            'forget-password': 'reset your Nthawi password',
            'change-email': 'change your Nthawi email',
          }[type];
          await sendEmail({
            to: email,
            subject: 'Your Nthawi verification code',
            text: `Your code to ${purpose} is ${otp}.\n\nIt expires in 5 minutes. Never share this code. If you did not request it, ignore this email.`,
          });
        },
      }),
      ...(env.BETTER_AUTH_API_KEY
        ? [
            dash({
              apiKey: env.BETTER_AUTH_API_KEY,
              // Keep the generated identity schema stable with or without dashboard access.
              activityTracking: { enabled: false },
            }),
          ]
        : []),
    ],
  });
}

export type NthawiAuth = ReturnType<typeof createAuth>;
