// packages/db/src/tenant.ts

import { sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

export interface TenantContext {
  ownerId: string
  workspaceId?: string
}

export async function withTenantTransaction<T>(
  db: NodePgDatabase,
  context: TenantContext,
  callback: (tx: NodePgDatabase) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.owner_id', ${context.ownerId}, true)`
    )

    // Shadow session-level context even when no workspace was supplied.
    // The policy helper turns empty context into NULL, denying tenant access.
    await tx.execute(
      sql`select set_config('app.workspace_id', ${context.workspaceId ?? ""}, true)`
    )

    return callback(tx)
  })
}
