import {
  Controller,
  Get,
  Header,
  Inject,
  Injectable,
  Module,
  ServiceUnavailableException,
  type DynamicModule,
} from '@nestjs/common';
import { probeDatabase } from '@nthawi/db';
import type { ApiResources } from '../resources.js';

export type ReadinessProbe = () => Promise<void>;
const READINESS_PROBE = Symbol('READINESS_PROBE');
// The DB probe owns its 3s deadline; the HTTP deadline also bounds stalled probes.
export const READINESS_TIMEOUT_MILLIS = 4000;

@Injectable()
export class ReadinessService {
  private inFlight: Promise<void> | undefined;
  constructor(
    @Inject(READINESS_PROBE) private readonly probe: ReadinessProbe,
  ) {}

  async check(timeoutMillis = READINESS_TIMEOUT_MILLIS): Promise<void> {
    if (!this.inFlight) {
      const flight = Promise.resolve().then(() => this.probe());
      this.inFlight = flight;
      // Keep the slot occupied after an HTTP timeout until actual probes settle.
      void flight.then(
        () => {
          if (this.inFlight === flight) this.inFlight = undefined;
        },
        () => {
          if (this.inFlight === flight) this.inFlight = undefined;
        },
      );
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.inFlight,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Readiness deadline exceeded.')),
            timeoutMillis,
          );
          timer.unref();
        }),
      ]);
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        code: 'API_NOT_READY',
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

@Controller('health')
class HealthController {
  constructor(
    @Inject(ReadinessService) private readonly readiness: ReadinessService,
  ) {}
  @Get('live')
  @Header('Cache-Control', 'no-store')
  live() {
    return { status: 'ok' };
  }
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    await this.readiness.check();
    return { status: 'ready' };
  }
}

@Module({})
export class HealthModule {
  static configure(resources: ApiResources): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [
        {
          provide: READINESS_PROBE,
          useValue: async () => {
            const results = await Promise.allSettled([
              probeDatabase(resources.authDatabase, 'auth'),
              probeDatabase(resources.applicationDatabase, 'business'),
            ]);
            if (results.some((result) => result.status === 'rejected'))
              throw new Error('Database readiness failed.');
          },
        },
        ReadinessService,
      ],
    };
  }
}
