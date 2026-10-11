import { Module, type DynamicModule } from '@nestjs/common';
import type { ServerEnv } from '@nthawi/tooling/env';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OwnerAuthModule, type ApiAuth } from './auth/owner-session.js';
import { HealthModule } from './health/health.js';
import { WorkspaceModule } from './workspaces/workspace-access.js';
import type { ApiResources } from './resources.js';

@Module({ controllers: [AppController], providers: [AppService] })
export class AppModule {
  static configure(
    env: ServerEnv,
    auth: ApiAuth,
    resources: ApiResources,
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        OwnerAuthModule.configure(auth.api, env),
        HealthModule.configure(resources),
        WorkspaceModule.configure(resources.applicationDatabase.db),
      ],
      providers: [
        {
          provide: 'API_RESOURCES_LIFECYCLE',
          useValue: { onApplicationShutdown: () => resources.close() },
        },
      ],
    };
  }
}
