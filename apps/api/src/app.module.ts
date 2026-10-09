import { Module, type DynamicModule } from '@nestjs/common';
import type { createDatabase } from '@nthawi/db';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  static withAuthDatabase(
    database: ReturnType<typeof createDatabase>,
  ): DynamicModule {
    return {
      module: AppModule,
      providers: [
        {
          provide: 'AUTH_DATABASE_LIFECYCLE',
          useValue: { onApplicationShutdown: () => database.pool.end() },
        },
      ],
    };
  }
}
