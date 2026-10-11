import {
  BadRequestException,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  type DynamicModule,
} from '@nestjs/common';
import { withTenantTransaction, type AppDatabase } from '@nthawi/db';
import { sql } from 'drizzle-orm';
import type { OwnerPrincipal } from '../auth/owner-session.js';

export type WorkspaceTransaction = Parameters<
  Parameters<AppDatabase['transaction']>[0]
>[0];
const BUSINESS_DATABASE = Symbol('BUSINESS_DATABASE');

// Private provider: only the authorization service is exported from this module.
@Injectable()
class WorkspaceRepository {
  async findOwned(
    tx: WorkspaceTransaction,
    ownerId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const result = await tx.execute<{ id: string }>(sql`
      select id from public.workspaces
      where id = ${workspaceId}::uuid and owner_id = ${ownerId}
      for share
    `);
    return result.rows.length === 1;
  }
}

@Injectable()
export class WorkspaceAccessService {
  constructor(
    @Inject(BUSINESS_DATABASE) private readonly database: AppDatabase,
    @Inject(WorkspaceRepository)
    private readonly repository: WorkspaceRepository,
  ) {}

  async withWorkspace<T>(
    owner: OwnerPrincipal,
    workspaceId: string,
    callback: (tx: WorkspaceTransaction) => Promise<T>,
  ): Promise<T> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        workspaceId,
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_WORKSPACE',
        message: 'Invalid workspace id.',
      });
    }
    return withTenantTransaction(
      this.database,
      { ownerId: owner.id },
      async (tx) => {
        if (!(await this.repository.findOwned(tx, owner.id, workspaceId))) {
          throw new NotFoundException({
            code: 'WORKSPACE_NOT_FOUND',
            message: 'Workspace not found.',
          });
        }
        await tx.execute(
          sql`select set_config('app.workspace_id', ${workspaceId}, true)`,
        );
        return callback(tx);
      },
    );
  }
}

@Module({})
export class WorkspaceModule {
  static configure(database: AppDatabase): DynamicModule {
    return {
      module: WorkspaceModule,
      providers: [
        { provide: BUSINESS_DATABASE, useValue: database },
        WorkspaceRepository,
        WorkspaceAccessService,
      ],
      exports: [WorkspaceAccessService],
    };
  }
}
