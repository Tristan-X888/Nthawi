import { randomUUID } from "node:crypto"

export const protectedTables = Object.freeze([
  "workspaces",
  "assistants",
  "knowledge_sources",
  "knowledge_revisions",
  "knowledge_chunks",
  "widget_installations",
  "visitor_sessions",
  "conversations",
  "messages",
  "citations",
  "ai_invocations",
  "monthly_usage",
])

export function createSyntheticFixtures() {
  const runId = randomUUID()
  const tenants = [0, 1].map((index) => {
    const workspaceId = randomUUID()
    const ownerId = `neon-acceptance:${runId}:${index}`
    const source = randomUUID()
    const revision = randomUUID()
    const chunk = randomUUID()
    const visitor = randomUUID()
    const conversation = randomUUID()
    const message = randomUUID()
    const marker = `Synthetic Neon acceptance ${runId}`
    const rows = new Map([
      [
        "workspaces",
        {
          id: workspaceId,
          owner_id: ownerId,
          name: marker,
          website_origin: `https://${workspaceId}.example.test`,
        },
      ],
      [
        "assistants",
        {
          id: randomUUID(),
          workspace_id: workspaceId,
          name: marker,
          greeting: "Synthetic greeting",
        },
      ],
      [
        "knowledge_sources",
        { id: source, workspace_id: workspaceId, type: "text", title: marker },
      ],
      [
        "knowledge_revisions",
        {
          id: revision,
          workspace_id: workspaceId,
          source_id: source,
          ordinal: 1,
          content_hash: runId,
          raw_text: marker,
        },
      ],
      [
        "knowledge_chunks",
        {
          id: chunk,
          workspace_id: workspaceId,
          revision_id: revision,
          ordinal: 1,
          content: marker,
          token_count: 1,
          embedding_model: "synthetic-acceptance",
          embedding_dimensions: 1536,
          embedding: JSON.stringify(Array(1536).fill(0)),
        },
      ],
      [
        "widget_installations",
        {
          id: randomUUID(),
          workspace_id: workspaceId,
          public_id: randomUUID(),
          allowed_origin: "https://example.test",
        },
      ],
      [
        "visitor_sessions",
        {
          id: visitor,
          workspace_id: workspaceId,
          credential_hash: randomUUID(),
          privacy_notice_version: "synthetic-acceptance",
          expires_at: "2099-01-01T00:00:00Z",
        },
      ],
      [
        "conversations",
        {
          id: conversation,
          workspace_id: workspaceId,
          visitor_session_id: visitor,
        },
      ],
      [
        "messages",
        {
          id: message,
          workspace_id: workspaceId,
          conversation_id: conversation,
          sequence: "1",
          sender: "visitor",
          body: marker,
        },
      ],
      [
        "citations",
        {
          id: randomUUID(),
          workspace_id: workspaceId,
          message_id: message,
          source_id: source,
          revision_id: revision,
          chunk_id: chunk,
          display_title: marker,
          reviewed_at: "2026-01-01T00:00:00Z",
        },
      ],
      [
        "ai_invocations",
        {
          id: randomUUID(),
          workspace_id: workspaceId,
          conversation_id: conversation,
          provider: "synthetic",
          model: "synthetic",
          prompt_version: "synthetic",
          price_version: "synthetic",
          state: "reserved",
          reserved_cost_micros: "0",
          request_id: randomUUID(),
        },
      ],
      ["monthly_usage", { workspace_id: workspaceId, period: "2026-11" }],
    ])
    return { workspaceId, ownerId, rows }
  })
  return { runId, tenants }
}

function assertFixture(fixture) {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  if (!uuid.test(fixture?.runId) || fixture.tenants?.length !== 2)
    throw new Error("NEON_SYNTHETIC_FIXTURE_INVALID")
  for (const [index, tenant] of fixture.tenants.entries()) {
    if (
      !uuid.test(tenant.workspaceId) ||
      tenant.ownerId !== `neon-acceptance:${fixture.runId}:${index}` ||
      tenant.rows.size !== protectedTables.length
    )
      throw new Error("NEON_SYNTHETIC_FIXTURE_INVALID")
    for (const table of protectedTables) {
      const row = tenant.rows.get(table)
      if (
        !row ||
        (table === "workspaces"
          ? row.id !== tenant.workspaceId || row.owner_id !== tenant.ownerId
          : row.workspace_id !== tenant.workspaceId)
      )
        throw new Error("NEON_SYNTHETIC_FIXTURE_INVALID")
      if (table !== "monthly_usage" && !uuid.test(row.id))
        throw new Error("NEON_SYNTHETIC_FIXTURE_INVALID")
    }
  }
  if (fixture.tenants[0].workspaceId === fixture.tenants[1].workspaceId)
    throw new Error("NEON_SYNTHETIC_FIXTURE_INVALID")
}

export function syntheticInsert(table, row) {
  if (
    !protectedTables.includes(table) ||
    Object.keys(row).some((key) => !/^[a-z_]+$/.test(key))
  )
    throw new Error("NEON_SYNTHETIC_FIXTURE_INVALID")
  return {
    text: `INSERT INTO public."${table}" (${Object.keys(row)
      .map((key) => `"${key}"`)
      .join(", ")}) VALUES (${Object.keys(row)
      .map((_, i) => `$${i + 1}`)
      .join(", ")})`,
    values: Object.values(row),
  }
}

export function syntheticPredicate(table, tenant) {
  if (!protectedTables.includes(table))
    throw new Error("NEON_SYNTHETIC_FIXTURE_INVALID")
  const row = tenant.rows.get(table)
  return table === "monthly_usage"
    ? {
        text: '"workspace_id" = $1::uuid AND "period" = $2',
        values: [tenant.workspaceId, row.period],
      }
    : { text: '"id" = $1::uuid', values: [row.id] }
}

export async function insertSyntheticFixtures(client, fixture) {
  assertFixture(fixture)
  for (const tenant of fixture.tenants) {
    for (const [table, row] of tenant.rows)
      await client.query(syntheticInsert(table, row))
  }
}

/** Deletes only this run's exact row keys, never all rows for an old workspace. */
export async function cleanupSyntheticFixtures(client, fixture) {
  assertFixture(fixture)
  await client.query("BEGIN")
  try {
    for (const table of [...protectedTables].reverse()) {
      for (const tenant of fixture.tenants) {
        const predicate = syntheticPredicate(table, tenant)
        await client.query(
          `DELETE FROM public."${table}" WHERE ${predicate.text}`,
          predicate.values
        )
      }
    }
    for (const table of protectedTables) {
      for (const tenant of fixture.tenants) {
        const predicate = syntheticPredicate(table, tenant)
        const result = await client.query(
          `SELECT count(*)::integer AS count FROM public."${table}" WHERE ${predicate.text}`,
          predicate.values
        )
        if (result.rows[0]?.count !== 0)
          throw new Error("NEON_SYNTHETIC_CLEANUP_INCOMPLETE")
      }
    }
    await client.query("COMMIT")
  } catch {
    await client.query("ROLLBACK").catch(() => {})
    throw new Error("NEON_SYNTHETIC_CLEANUP_FAILED")
  }
}
