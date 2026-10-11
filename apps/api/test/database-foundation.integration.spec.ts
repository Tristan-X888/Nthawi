import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDatabase, type DatabaseHandle } from '@nthawi/db';
import { loadServerEnv } from '@nthawi/tooling/env';
import { sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabaseTestFixture,
  type DatabaseTestFixture,
} from '../../../packages/db/test/helpers/database-fixture.mjs';
import {
  createApiApplication,
  createApiResources,
  type ApiResources,
} from '../src/application.js';
import { createAuth } from '../src/auth/create-auth.js';
import {
  WorkspaceAccessService,
  type WorkspaceTransaction,
} from '../src/workspaces/workspace-access.js';

const adminUrl =
  process.env.RLS_TEST_ADMIN_URL ?? process.env.AUTH_TEST_ADMIN_URL;
if (!adminUrl)
  throw new Error(
    'Set RLS_TEST_ADMIN_URL to a local disposable PostgreSQL superuser connection.',
  );

const ownerA = {
  id: randomUUID(),
  name: 'Owner A',
  email: 'owner-a@example.test',
  emailVerified: true,
} as const;
const ownerB = {
  id: randomUUID(),
  name: 'Owner B',
  email: 'owner-b@example.test',
  emailVerified: true,
} as const;
const workspaceA = randomUUID();
const secondWorkspaceA = randomUUID();
const workspaceB = randomUUID();
const revisions = new Map<string, string>();
const sources = new Map<string, string>();
const queueName = 'step4_claims';
const retryQueueName = 'step4_retry';
const queueErrors: string[] = [];
const queues: PgBoss[] = [];
let fixture: DatabaseTestFixture | undefined;
let app: NestFastifyApplication | undefined;
let resources: ApiResources | undefined;
let business: DatabaseHandle | undefined;
let workspace: WorkspaceAccessService;
let firstWorker: PgBoss;
let secondWorker: PgBoss;

function vector(first: number, second = 0): string {
  const values = Array<number>(1536).fill(0);
  values[0] = first;
  values[1] = second;
  return JSON.stringify(values);
}
function queue(connectionString: string, runtime: boolean): PgBoss {
  const boss = new PgBoss({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 2000,
    migrate: !runtime,
    createSchema: !runtime,
    supervise: false,
    schedule: false,
    useListenNotify: false,
  });
  // The error event can contain job data/credentials. Record only a fixed marker.
  boss.on('error', () => queueErrors.push('PG_BOSS_ERROR'));
  queues.push(boss);
  return boss;
}
async function nearest(tx: WorkspaceTransaction) {
  return (
    await tx.execute<{ content: string; distance: number }>(sql`
    select content, embedding <=> ${vector(1)}::vector as distance
    from public.knowledge_chunks
    order by embedding <=> ${vector(1)}::vector, id
  `)
  ).rows;
}

beforeAll(async () => {
  fixture = await createDatabaseTestFixture(adminUrl);
  for (const [workspaceId, ownerId, label] of [
    [workspaceA, ownerA.id, 'first'],
    [secondWorkspaceA, ownerA.id, 'second'],
    [workspaceB, ownerB.id, 'other'],
  ] as const) {
    await fixture.pools.admin.query(
      'INSERT INTO public.workspaces (id,owner_id,name,website_origin) VALUES ($1,$2,$3,$4)',
      [workspaceId, ownerId, label, `https://${label}.example.test`],
    );
    const sourceId = randomUUID();
    const revisionId = randomUUID();
    sources.set(workspaceId, sourceId);
    revisions.set(workspaceId, revisionId);
    await fixture.pools.admin.query(
      "INSERT INTO public.knowledge_sources (id,workspace_id,type,title) VALUES ($1,$2,'text',$3)",
      [sourceId, workspaceId, label],
    );
    await fixture.pools.admin.query(
      "INSERT INTO public.knowledge_revisions (id,workspace_id,source_id,ordinal,content_hash,state) VALUES ($1,$2,$3,1,$4,'published')",
      [revisionId, workspaceId, sourceId, `synthetic-${label}`],
    );
    const samples =
      workspaceId === workspaceA
        ? [
            ['exact', vector(1)],
            ['mixed', vector(1, 1)],
            ['orthogonal', vector(0, 1)],
            ['opposite', vector(-1)],
          ]
        : [[`${label}-hidden`, vector(1)]];
    for (const [ordinal, [content, embedding]] of samples.entries()) {
      await fixture.pools.admin.query(
        'INSERT INTO public.knowledge_chunks (workspace_id,revision_id,ordinal,content,token_count,embedding_model,embedding_dimensions,embedding) VALUES ($1,$2,$3,$4,1,$5,1536,$6::vector)',
        [
          workspaceId,
          revisionId,
          ordinal,
          content,
          'deterministic-test-vector',
          embedding,
        ],
      );
    }
  }
  const env = loadServerEnv({
    NODE_ENV: 'test',
    WEB_ORIGIN: 'http://localhost:3000',
    WIDGET_ORIGIN: 'http://localhost:5173',
    BETTER_AUTH_URL: 'http://localhost:4000',
    BETTER_AUTH_SECRET: 'synthetic-foundation-auth-secret-0123456789',
    DATABASE_URL: fixture.urls.business,
    AUTH_DATABASE_URL: fixture.urls.auth,
    GOOGLE_CLIENT_ID: 'synthetic',
    GOOGLE_CLIENT_SECRET: 'synthetic',
    RESEND_API_KEY: 'synthetic',
    EMAIL_FROM: 'Nthawi <test@example.test>',
    OPENAI_API_KEY: 'synthetic',
  });
  business = createDatabase(fixture.urls.business, { max: 1 });
  const authDatabase = createDatabase(fixture.urls.auth, { max: 1 });
  resources = createApiResources(authDatabase, business);
  app = await createApiApplication({
    env,
    resources,
    auth: createAuth(env, authDatabase.db, async () => undefined),
    logger: false,
  });
  workspace = app.get(WorkspaceAccessService);

  // Installation and queue DDL use the migrator; workers never migrate or create schemas.
  const installer = queue(fixture.urls.migrator, false);
  await installer.start();
  await installer.createQueue(queueName, { retryLimit: 0 });
  await installer.createQueue(retryQueueName, {
    retryLimit: 1,
    retryDelay: 0,
    retryBackoff: false,
  });
  await installer.stop({ graceful: false, timeout: 1000 });
  await fixture.provisionJobsSchema();
  firstWorker = queue(fixture.urls.jobs, true);
  secondWorker = queue(fixture.urls.jobs, true);
  await Promise.all([firstWorker.start(), secondWorker.start()]);
});

afterAll(async () => {
  const results = await Promise.allSettled([
    ...queues.map((boss) => boss.stop({ graceful: false, timeout: 1000 })),
    (async () => {
      try {
        await app?.close();
      } finally {
        await resources?.close();
      }
    })(),
  ]);
  // All runtime clients must release connections before the generated DB/roles are dropped.
  await fixture?.close();
  if (results.some((result) => result.status === 'rejected'))
    throw new Error('Integration runtime cleanup failed.');
});

describe('real application workspace transaction boundary', () => {
  it('authorizes owned workspaces and conceals absent and cross-owner ids before entering work', async () => {
    const rows = await workspace.withWorkspace(ownerA, workspaceA, (tx) =>
      tx.execute<{ id: string }>(sql`select id from public.knowledge_sources`),
    );
    expect(rows.rows.map((row) => row.id)).toEqual([sources.get(workspaceA)]);
    let reachedWork = false;
    for (const id of [workspaceB, randomUUID()]) {
      await expect(
        workspace.withWorkspace(ownerA, id, async () => {
          reachedWork = true;
        }),
      ).rejects.toMatchObject({ status: 404 });
    }
    await expect(
      workspace.withWorkspace(ownerA, 'invalid-uuid', async () => {
        reachedWork = true;
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(reachedWork).toBe(false);
    const role = (
      await business!.pool.query('select current_user, session_user')
    ).rows[0];
    expect(role).toEqual({
      current_user: fixture!.roles.business,
      session_user: fixture!.roles.business,
    });
  });

  it('commits successful work, rolls back failed work and reuses the same connection without context leakage', async () => {
    const committed = randomUUID();
    const rolledBack = randomUUID();
    const initialPid = (
      await business!.pool.query('select pg_backend_pid() as pid')
    ).rows[0].pid;
    await workspace.withWorkspace(ownerA, workspaceA, (tx) =>
      tx.execute(
        sql`insert into public.knowledge_sources (id,workspace_id,type,title) values (${committed}::uuid,${workspaceA}::uuid,'text','committed')`,
      ),
    );
    await expect(
      workspace.withWorkspace(ownerA, workspaceA, async (tx) => {
        await tx.execute(
          sql`insert into public.knowledge_sources (id,workspace_id,type,title) values (${rolledBack}::uuid,${workspaceA}::uuid,'text','rolled back')`,
        );
        throw new Error('expected transaction failure');
      }),
    ).rejects.toThrow('expected transaction failure');
    const persisted = await fixture!.pools.admin.query(
      'select id from public.knowledge_sources where id = any($1::uuid[])',
      [[committed, rolledBack]],
    );
    expect(persisted.rows).toEqual([{ id: committed }]);
    const reused = (
      await business!.pool.query(
        "select pg_backend_pid() as pid, nullif(current_setting('app.owner_id',true),'') as owner, nullif(current_setting('app.workspace_id',true),'') as workspace",
      )
    ).rows[0];
    expect(reused).toEqual({ pid: initialPid, owner: null, workspace: null });
    expect(
      (await business!.pool.query('select id from public.knowledge_sources'))
        .rows,
    ).toEqual([]);
    expect(
      await workspace.withWorkspace(
        ownerB,
        workspaceB,
        async (tx) =>
          (
            await tx.execute<{ id: string }>(
              sql`select id from public.knowledge_sources`,
            )
          ).rows,
      ),
    ).toEqual([{ id: sources.get(workspaceB) }]);
  });

  it('shadows stale connection context before ownership and restores it only after transaction exit', async () => {
    await business!.pool.query(
      "select set_config('app.owner_id',$1,false),set_config('app.workspace_id',$2,false)",
      [ownerB.id, workspaceB],
    );
    try {
      const result = await workspace.withWorkspace(ownerA, workspaceA, nearest);
      expect(result.map((row) => row.content)).toEqual([
        'exact',
        'mixed',
        'orthogonal',
        'opposite',
      ]);
      const stale = (
        await business!.pool.query(
          "select current_setting('app.owner_id') as owner,current_setting('app.workspace_id') as workspace",
        )
      ).rows[0];
      expect(stale).toEqual({ owner: ownerB.id, workspace: workspaceB });
    } finally {
      await business!.pool.query(
        "select set_config('app.owner_id','',false),set_config('app.workspace_id','',false)",
      );
    }
  });
});

describe('deterministic pgvector1536 under tenant RLS', () => {
  it('orders cosine distance correctly while isolating another workspace belonging to the same owner', async () => {
    const rows = await workspace.withWorkspace(ownerA, workspaceA, nearest);
    expect(rows.map((row) => row.content)).toEqual([
      'exact',
      'mixed',
      'orthogonal',
      'opposite',
    ]);
    expect(rows.map((row) => row.distance)).toEqual([
      expect.closeTo(0, 6),
      expect.closeTo(1 - 1 / Math.sqrt(2), 6),
      expect.closeTo(1, 6),
      expect.closeTo(2, 6),
    ]);
    const second = await workspace.withWorkspace(
      ownerA,
      secondWorkspaceA,
      nearest,
    );
    expect(second).toEqual([{ content: 'second-hidden', distance: 0 }]);
    const other = await workspace.withWorkspace(ownerB, workspaceB, nearest);
    expect(other).toEqual([{ content: 'other-hidden', distance: 0 }]);
    const hidden = await workspace.withWorkspace(ownerA, workspaceA, (tx) =>
      tx.execute(
        sql`select id from public.knowledge_chunks where workspace_id in (${secondWorkspaceA}::uuid,${workspaceB}::uuid)`,
      ),
    );
    expect(hidden.rows).toEqual([]);
  });

  it('rejects wrong dimensions and cross-workspace revision references and remains usable afterward', async () => {
    await expect(
      workspace.withWorkspace(ownerA, workspaceA, (tx) =>
        tx.execute(
          sql`insert into public.knowledge_chunks (workspace_id,revision_id,ordinal,content,token_count,embedding_model,embedding_dimensions,embedding) values (${workspaceA}::uuid,${revisions.get(workspaceA)}::uuid,10,'invalid',1,'deterministic-test-vector',2,'[1,0]'::vector)`,
        ),
      ),
    ).rejects.toMatchObject({ cause: { code: '22000' } });
    await expect(
      workspace.withWorkspace(ownerA, workspaceA, (tx) =>
        tx.execute(
          sql`insert into public.knowledge_chunks (workspace_id,revision_id,ordinal,content,token_count,embedding_model,embedding_dimensions,embedding) values (${workspaceA}::uuid,${revisions.get(secondWorkspaceA)}::uuid,11,'invalid reference',1,'deterministic-test-vector',1536,${vector(1)}::vector)`,
        ),
      ),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    expect(
      (await workspace.withWorkspace(ownerA, workspaceA, nearest)).map(
        (row) => row.content,
      ),
    ).toEqual(['exact', 'mixed', 'orthogonal', 'opposite']);
  });
});

describe('restricted pg-boss12.35 jobs runtime', () => {
  it('removes residual maintenance column grants when runtime privileges are provisioned again', async () => {
    await fixture!.pools.admin.query(
      `grant insert(command),update(command) on pgboss.bam to "${fixture!.roles.jobs}"`,
    );
    const readPrivileges = async () =>
      (
        await fixture!.pools.jobs.query(`
      select has_any_column_privilege(current_user,'pgboss.bam','INSERT') as insert_column,
        has_any_column_privilege(current_user,'pgboss.bam','UPDATE') as update_column
    `)
      ).rows[0];
    expect(await readPrivileges()).toEqual({
      insert_column: true,
      update_column: true,
    });
    await fixture!.provisionJobsSchema();
    expect(await readPrivileges()).toEqual({
      insert_column: false,
      update_column: false,
    });
  });

  it('keeps API capabilities ready and denies deferred DDL and migration writes', async () => {
    const ready = await app!.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready' });
    expect(ready.headers['cache-control']).toBe('no-store');
    const privileges = (
      await fixture!.pools.jobs.query(`
      select
        has_table_privilege(current_user,'pgboss.bam','INSERT') as bam_insert,
        has_table_privilege(current_user,'pgboss.bam','UPDATE') as bam_update,
        has_table_privilege(current_user,'pgboss.version','UPDATE') as version_update,
        has_function_privilege(current_user,'pgboss.job_table_run_async(text,integer,text,text,text)','EXECUTE') as async_ddl,
        has_function_privilege(current_user,'pgboss.job_table_run(text,text,text)','EXECUTE') as immediate_ddl,
        has_function_privilege(current_user,'pgboss.create_queue(text,jsonb)','EXECUTE') as create_queue,
        has_function_privilege(current_user,'pgboss.delete_queue(text)','EXECUTE') as delete_queue
    `)
    ).rows[0];
    expect(privileges).toEqual({
      bam_insert: false,
      bam_update: false,
      version_update: false,
      async_ddl: false,
      immediate_ddl: false,
      create_queue: false,
      delete_queue: false,
    });
    // False predicates perform permission checks without writing commands or rows.
    for (const statement of [
      'insert into pgboss.bam (name,version,table_name,command) select null::text,null::integer,null::text,null::text where false',
      'update pgboss.bam set status=status where false',
      'update pgboss.version set version=version where false',
    ]) {
      await expect(fixture!.pools.jobs.query(statement)).rejects.toMatchObject({
        code: '42501',
      });
    }
  });

  it('claims concurrently without duplicates and completes every claimed job', async () => {
    const sent = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        firstWorker.send(queueName, { index }),
      ),
    );
    expect(sent.every((id) => typeof id === 'string')).toBe(true);
    const claims = await Promise.all([
      firstWorker.fetch<{ index: number }>(queueName, {
        batchSize: 8,
        includeMetadata: true,
      }),
      secondWorker.fetch<{ index: number }>(queueName, {
        batchSize: 8,
        includeMetadata: true,
      }),
    ]);
    const jobs = claims.flat();
    expect(jobs).toHaveLength(8);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(8);
    expect(new Set(jobs.map((job) => job.id))).toEqual(new Set(sent));
    await Promise.all(
      claims.map((claimed, index) =>
        Promise.all(
          claimed.map((job) =>
            [firstWorker, secondWorker][index]!.complete(queueName, job, {
              handled: true,
            }),
          ),
        ),
      ),
    );
    const complete = await firstWorker.findJobs(queueName);
    expect(complete).toHaveLength(8);
    expect(complete.every((job) => job.state === 'completed')).toBe(true);
    expect(complete.map((job) => job.output)).toEqual(
      Array(8).fill({ handled: true }),
    );
    expect(await firstWorker.fetch(queueName)).toEqual([]);
  });

  it('retries a failed claim once, rejects privileged access and shuts down both clients', async () => {
    const id = await firstWorker.send(retryQueueName, {
      operation: 'deterministic retry',
    });
    const [initial] = await firstWorker.fetch(retryQueueName, {
      includeMetadata: true,
    });
    expect(initial!.id).toBe(id);
    expect(initial!.retryCount).toBe(0);
    await firstWorker.fail(retryQueueName, initial!, { code: 'TEST_RETRY' });
    expect(
      (await secondWorker.findJobs(retryQueueName, { id: id! }))[0]!.state,
    ).toBe('retry');
    const [retried] = await secondWorker.fetch(retryQueueName, {
      includeMetadata: true,
    });
    expect(retried!.id).toBe(id);
    expect(retried!.retryCount).toBe(1);
    await secondWorker.complete(retryQueueName, retried!, {
      completedAfterRetry: true,
    });
    expect(
      (await firstWorker.findJobs(retryQueueName, { id: id! }))[0]!.state,
    ).toBe('completed');
    const identity = (
      await fixture!.pools.jobs.query('select current_user,session_user')
    ).rows[0];
    expect(identity).toEqual({
      current_user: fixture!.roles.jobs,
      session_user: fixture!.roles.jobs,
    });
    for (const statement of [
      'select * from public."user"',
      'select * from public.workspaces',
      'select * from public.knowledge_chunks',
      'select * from public.audit_events',
      'create table pgboss.forbidden_test (id integer)',
    ]) {
      await expect(fixture!.pools.jobs.query(statement)).rejects.toMatchObject({
        code: '42501',
      });
    }
    for (const pool of [fixture!.pools.auth, fixture!.pools.business]) {
      await expect(
        pool.query('select * from pgboss.job'),
      ).rejects.toMatchObject({ code: '42501' });
    }
    expect(queueErrors).toEqual([]);
    await Promise.all([
      firstWorker.stop({ graceful: false, timeout: 1000 }),
      secondWorker.stop({ graceful: false, timeout: 1000 }),
    ]);
    await expect(firstWorker.getDb().executeSql('select 1')).rejects.toThrow();
    await expect(secondWorker.getDb().executeSql('select 1')).rejects.toThrow();
  });
});
