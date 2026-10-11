import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Module,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  type CanActivate,
  type DynamicModule,
  type ExecutionContext,
} from '@nestjs/common';
import { getAllowedAuthOrigins, type ServerEnv } from '@nthawi/tooling/env';
import type { MeResponse } from '@nthawi/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { NthawiAuth } from './create-auth.js';
import { OWNER_SESSION_FRESH_SECONDS } from './policy.js';

type AuthSession = NonNullable<
  Awaited<ReturnType<NthawiAuth['api']['getSession']>>
>;
type SessionRecord = {
  user: Pick<AuthSession['user'], 'id' | 'name' | 'email' | 'emailVerified'>;
  session: Pick<AuthSession['session'], 'userId' | 'createdAt' | 'expiresAt'>;
};

export interface SessionAuthority {
  getSession(options: {
    headers: Headers;
    query: { disableCookieCache: true; disableRefresh: true };
  }): Promise<SessionRecord | null>;
}
export type ApiAuth = Pick<NthawiAuth, 'handler'> & { api: SessionAuthority };
export type OwnerPrincipal = MeResponse['owner'];
export type OwnerRequest = FastifyRequest & {
  ownerSession?: MeResponse | null;
};
export { OWNER_SESSION_FRESH_SECONDS } from './policy.js';
const AUTHORITY = Symbol('SESSION_AUTHORITY');
const ORIGINS = Symbol('OWNER_ORIGINS');

@Injectable()
export class OwnerSessionService {
  constructor(
    @Inject(AUTHORITY) private readonly authority: SessionAuthority,
  ) {}

  async read(headers: Headers, now = new Date()): Promise<MeResponse> {
    let record: SessionRecord | null;
    try {
      record = await this.authority.getSession({
        headers,
        query: { disableCookieCache: true, disableRefresh: true },
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'AUTH_UNAVAILABLE',
        message: 'Authentication temporarily unavailable.',
      });
    }
    if (
      !record ||
      record.session.userId !== record.user.id ||
      !Number.isFinite(record.session.createdAt.getTime()) ||
      !Number.isFinite(record.session.expiresAt.getTime()) ||
      record.session.expiresAt.getTime() <= now.getTime()
    ) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'A valid owner session is required.',
      });
    }
    if (!record.user.emailVerified) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email to continue.',
      });
    }
    return {
      owner: {
        id: record.user.id,
        name: record.user.name,
        email: record.user.email,
        emailVerified: record.user.emailVerified,
      },
      session: {
        createdAt: record.session.createdAt.toISOString(),
        expiresAt: record.session.expiresAt.toISOString(),
        freshUntil: new Date(
          Math.min(
            record.session.expiresAt.getTime(),
            record.session.createdAt.getTime() +
              OWNER_SESSION_FRESH_SECONDS * 1000,
          ),
        ).toISOString(),
      },
    };
  }
}

@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(
    @Inject(OwnerSessionService) private readonly sessions: OwnerSessionService,
    @Inject(ORIGINS) private readonly origins: readonly string[],
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OwnerRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    reply.header('cache-control', 'no-store');
    const origin = request.headers.origin;
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (
      (origin !== undefined && !this.origins.includes(origin)) ||
      (unsafe && !origin)
    ) {
      throw new ForbiddenException({
        code: 'INVALID_ORIGIN',
        message: 'Invalid origin',
      });
    }
    const headers = new Headers();
    if (request.headers.cookie) headers.set('cookie', request.headers.cookie);
    request.ownerSession = await this.sessions.read(headers);
    return true;
  }
}

@Controller('api/v1/me')
@UseGuards(OwnerGuard)
class MeController {
  @Get()
  getMe(@Req() request: OwnerRequest): MeResponse {
    // OwnerGuard always installs this projection before the controller runs.
    return request.ownerSession!;
  }
}

@Module({})
export class OwnerAuthModule {
  static configure(
    auth: SessionAuthority,
    env: Pick<ServerEnv, 'WEB_ORIGIN' | 'AUTH_TRUSTED_ORIGINS'>,
  ): DynamicModule {
    return {
      module: OwnerAuthModule,
      controllers: [MeController],
      providers: [
        { provide: AUTHORITY, useValue: auth },
        { provide: ORIGINS, useValue: getAllowedAuthOrigins(env) },
        OwnerSessionService,
        OwnerGuard,
      ],
      exports: [OwnerGuard, OwnerSessionService],
    };
  }
}
