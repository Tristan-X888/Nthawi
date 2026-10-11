import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { AppDatabase } from '@nthawi/db';
import { WorkspaceAccessService } from './workspace-access.js';

const workspaceId = 'a0c05873-7bcc-48a0-8794-5150ea77358c';
const owner = {
  id: 'verified-owner',
  name: 'Owner',
  email: 'owner@example.test',
  emailVerified: true,
} as const;

function fixture(owned: boolean) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const execute = vi.fn(async (statement) => {
    const rendered = new PgDialect().sqlToQuery(statement);
    calls.push(rendered);
    return { rows: owned ? [{ id: workspaceId }] : [] };
  });
  const tx = { execute };
  const transaction = vi.fn(async (callback) => callback(tx));
  const repository = {
    findOwned: vi.fn(async (currentTx, ownerId, id) => {
      expect(currentTx).toBe(tx);
      expect(calls.map((call) => call.params)).toEqual([[owner.id], ['']]);
      expect(calls[0]!.sql).toContain("set_config('app.owner_id'");
      expect(calls[1]!.sql).toContain("set_config('app.workspace_id'");
      expect(ownerId).toBe(owner.id);
      expect(id).toBe(workspaceId);
      return owned;
    }),
  };
  const service = new WorkspaceAccessService(
    { transaction } as unknown as AppDatabase,
    repository as unknown as ConstructorParameters<
      typeof WorkspaceAccessService
    >[1],
  );
  return { service, calls, tx, transaction, repository };
}

describe('workspace entry authorization', () => {
  it('sets owner first, checks ownership, then sets workspace before callback in the same transaction', async () => {
    const { service, calls, tx, transaction, repository } = fixture(true);
    const callback = vi.fn(async (currentTx) => {
      expect(currentTx).toBe(tx);
      expect(calls[2]!.params).toEqual([workspaceId]);
      return 'result';
    });
    expect(await service.withWorkspace(owner, workspaceId, callback)).toBe(
      'result',
    );
    expect(transaction).toHaveBeenCalledOnce();
    expect(repository.findOwned).toHaveBeenCalledOnce();
  });

  it('does not enter workspace context or invoke work when ownership is absent', async () => {
    const { service, calls } = fixture(false);
    const callback = vi.fn();
    await expect(
      service.withWorkspace(owner, workspaceId, callback),
    ).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(2);
    expect(callback).not.toHaveBeenCalled();
  });

  it('rejects malformed workspace ids before opening a transaction', async () => {
    const { service, transaction } = fixture(true);
    await expect(
      service.withWorkspace(owner, 'not-a-uuid', vi.fn()),
    ).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });
});
