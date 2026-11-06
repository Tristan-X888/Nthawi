import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import test from "node:test"
import {
  recoveryPolicy,
  canonicalRecoveryJson,
  signRecoveryEnvelope,
  verifyRecoveryEnvelope,
  checkpointTiming,
  assertCopyBeforeAcknowledgement,
  assertDeletionReceiptBeforeCommit,
  assertContiguousJournalTail,
  assertCheckpointPublication,
  deletedDatabaseByteBound,
  assertRestorePin,
  garbageCollectionDecision,
  registerCheckpointAttempt,
} from "./neon-recovery-contract.mjs"

const { privateKey, publicKey } = generateKeyPairSync("ed25519")
const at = "2026-11-04T12:00:00.000Z"
const later = (ms) => new Date(Date.parse(at) + ms).toISOString()
const hour = 3_600_000
function payload(type, extra = {}) {
  return {
    version: recoveryPolicy.version,
    type,
    environment: "test",
    ...extra,
  }
}
function envelope(type, extra) {
  return signRecoveryEnvelope(payload(type, extra), privateKey)
}

test("signed contract canonicalizes keys and rejects tampering, wrong environment, key and type", () => {
  assert.equal(
    canonicalRecoveryJson({ b: [1, true], a: "text" }),
    '{"a":"text","b":[1,true]}'
  )
  assert.throws(() => canonicalRecoveryJson({ invalid: 1.2 }))
  const signed = envelope("object-copy", { bytes: 1 })
  assert.equal(
    verifyRecoveryEnvelope(signed, publicKey, "object-copy", "test").bytes,
    1
  )
  assert.throws(() =>
    verifyRecoveryEnvelope(signed, publicKey, "object-copy", "production")
  )
  assert.throws(() =>
    verifyRecoveryEnvelope(
      signed,
      generateKeyPairSync("ed25519").publicKey,
      "object-copy",
      "test"
    )
  )
  assert.throws(() =>
    verifyRecoveryEnvelope(signed, publicKey, "deletion-intent", "test")
  )
  signed.payload.bytes = 2
  assert.throws(() =>
    verifyRecoveryEnvelope(signed, publicKey, "object-copy", "test")
  )
})

test("UTC slots and inclusive twenty-minute completion bound; locks retain original clock", () => {
  const timing = checkpointTiming({
    slot: at,
    snapshotAt: later(60_000),
    completedAt: later(20 * 60_000),
  })
  assert.equal(timing.longPoint, true)
  assert.equal(
    Date.parse(timing.lockUntil) - Date.parse(later(20 * 60_000)),
    185 * hour
  )
  assert.equal(
    Date.parse(timing.hardDeleteBy) - Date.parse(later(60_000)),
    191 * hour + 20 * 60_000
  )
  assert.equal(
    recoveryPolicy.maximumDeletedDatabaseBytesMs,
    191 * hour + 35 * 60_000
  )
  assert.ok(
    recoveryPolicy.maximumDeletedDatabaseBytesMs <
      recoveryPolicy.deletedBytesCeilingMs
  )
  const ordinary = checkpointTiming({
    slot: later(30 * 60_000),
    snapshotAt: later(30 * 60_000),
    completedAt: later(31 * 60_000),
  })
  assert.equal(ordinary.longPoint, false)
  assert.equal(
    Date.parse(ordinary.lockUntil) - Date.parse(later(31 * 60_000)),
    28 * hour
  )
  for (const times of [
    { slot: later(1), snapshotAt: later(1), completedAt: later(2) },
    { slot: at, snapshotAt: later(-1), completedAt: at },
    { slot: at, snapshotAt: at, completedAt: later(20 * 60_000 + 1) },
  ])
    assert.throws(() => checkpointTiming(times))
})

test("copy-before-ack binds bytes/hash/generation; stale, short lock, deleted and non-durable receipts fail", () => {
  const expected = {
    environment: "test",
    operationId: "upload1",
    resourceId: "artifact1",
    generation: 1,
    sha256: "a".repeat(64),
    bytes: 123,
  }
  const fields = {
    ...expected,
    durable: true,
    createdAt: at,
    lockUntil: later(7 * 24 * hour),
  }
  assert.deepEqual(
    assertCopyBeforeAcknowledgement(
      envelope("object-copy", fields),
      publicKey,
      expected,
      at
    ),
    { acknowledgementAllowed: true, refreshRequired: false }
  )
  assert.equal(
    assertCopyBeforeAcknowledgement(
      envelope("object-copy", fields),
      publicKey,
      expected,
      later(5.5 * 24 * hour)
    ).refreshRequired,
    true
  )
  for (const change of [
    { bytes: 124 },
    { generation: 2 },
    { durable: false },
    { lockUntil: later(2 * hour) },
  ])
    assert.throws(() =>
      assertCopyBeforeAcknowledgement(
        envelope("object-copy", { ...fields, ...change }),
        publicKey,
        expected,
        at
      )
    )
  assert.throws(() =>
    assertCopyBeforeAcknowledgement(
      envelope("object-copy", fields),
      publicKey,
      { ...expected, deleted: true },
      at
    )
  )
  assert.throws(() =>
    assertCopyBeforeAcknowledgement(
      envelope("object-copy", fields),
      publicKey,
      expected,
      later(6 * 24 * hour + 1)
    )
  )
})

test("deletion receipt is required before matching locked generation and DB acknowledgement", () => {
  const expected = {
    environment: "test",
    operationId: "delete1",
    resourceId: "workspace1",
    scope: "workspace",
    generation: 2,
    lockedGeneration: 2,
  }
  const fields = {
    ...expected,
    receiptId: "receipt1",
    sequence: 1,
    createdAt: at,
    durable: true,
  }
  assert.deepEqual(
    assertDeletionReceiptBeforeCommit(
      envelope("deletion-intent", fields),
      publicKey,
      expected,
      at
    ),
    { receiptId: "receipt1", sequence: 1, generation: 2 }
  )
  for (const change of [
    { durable: false },
    { sequence: 0 },
    { receiptId: "" },
    { createdAt: later(1) },
  ])
    assert.throws(() =>
      assertDeletionReceiptBeforeCommit(
        envelope("deletion-intent", { ...fields, ...change }),
        publicKey,
        expected,
        at
      )
    )
  assert.throws(() =>
    assertDeletionReceiptBeforeCommit(
      envelope("deletion-intent", fields),
      publicKey,
      { ...expected, lockedGeneration: 3 },
      at
    )
  )
})

test("independent latest journal tail must be contiguous; unknown commit remains deny-only", () => {
  const entry = (sequence, operationId = `delete${sequence}`) =>
    envelope("deletion-intent", {
      sequence,
      operationId,
      generation: 1,
      scope: "workspace",
      resourceId: "workspace1",
      receiptId: `receipt${sequence}`,
      durable: true,
      createdAt: at,
    })
  const tail = {
    environment: "test",
    watermark: 5,
    latestSequence: 7,
    head: envelope("journal-head", {
      latestSequence: 7,
      observedAt: at,
      durable: true,
    }),
    now: at,
    entries: [entry(6), entry(7)],
  }
  assert.equal(
    assertContiguousJournalTail(tail, publicKey)[1].restoreAction,
    "deny-until-reconciled"
  )
  for (const change of [
    { entries: [entry(6)] },
    { entries: [entry(5), entry(7)] },
    { entries: [entry(6), entry(7, "delete6")] },
    { latestSequence: 8 },
  ])
    assert.throws(() =>
      assertContiguousJournalTail({ ...tail, ...change }, publicKey)
    )
  assert.throws(() =>
    assertContiguousJournalTail({ ...tail, head: undefined }, publicKey)
  )
  assert.throws(() =>
    assertContiguousJournalTail({ ...tail, now: later(60_001) }, publicKey)
  )
  const regressing = [
    signRecoveryEnvelope(
      payload("deletion-intent", { ...entry(6).payload, generation: 2 }),
      privateKey
    ),
    entry(7),
  ]
  assert.throws(() =>
    assertContiguousJournalTail({ ...tail, entries: regressing }, publicKey)
  )
})

test("checkpoint cannot publish without prior catalog registration, signed complete coverage and deadline", () => {
  const manifest = payload("checkpoint", {
    slot: at,
    snapshotAt: at,
    completedAt: later(60_000),
    dumpSha256: "a".repeat(64),
    complete: true,
    objectCoverageVerified: true,
    contiguousJournalVerified: true,
  })
  const args = {
    catalogRegisteredBeforeUpload: true,
    manifest,
    envelope: signRecoveryEnvelope(manifest, privateKey),
    publicKey,
    environment: "test",
    expectedDumpHash: "a".repeat(64),
    now: later(60_000),
  }
  assert.equal(assertCheckpointPublication(args).longPoint, true)
  assert.throws(() =>
    assertCheckpointPublication({
      ...args,
      catalogRegisteredBeforeUpload: false,
    })
  )
  assert.throws(() =>
    assertCheckpointPublication({ ...args, expectedDumpHash: "b".repeat(64) })
  )
  const incomplete = { ...manifest, complete: false }
  assert.throws(() =>
    assertCheckpointPublication({
      ...args,
      manifest: incomplete,
      envelope: signRecoveryEnvelope(incomplete, privateKey),
    })
  )
})

test("deleted database bytes are bounded by 191 h 35 min, inside the 192 h ceiling", () => {
  assert.deepEqual(deletedDatabaseByteBound(), {
    cleanupMs: 900_000,
    longLockMs: 666_000_000,
    creationDelayMs: 1_200_000,
    garbageCollectionMs: 21_600_000,
    totalMs: 689_700_000,
    ceilingMs: 691_200_000,
    marginMs: 1_500_000,
    withinCeiling: true,
  })
})

test("every attempt is catalogued before upload with a deadline from its slot", () => {
  assert.deepEqual(
    registerCheckpointAttempt({
      attemptId: "attempt-1",
      slot: "2026-11-04T12:00:00.000Z",
      registeredAt: "2026-11-04T12:01:00.000Z",
      uploadStartedAt: "2026-11-04T12:05:00.000Z",
    }),
    {
      attemptId: "attempt-1",
      slot: "2026-11-04T12:00:00.000Z",
      longPoint: true,
      hardDeleteBy: "2026-11-12T11:20:00.000Z",
    }
  )
  assert.equal(
    registerCheckpointAttempt({
      attemptId: "attempt-2",
      slot: "2026-11-04T12:30:00.000Z",
      registeredAt: "2026-11-04T12:30:00.000Z",
      uploadStartedAt: "2026-11-04T12:30:00.000Z",
    }).hardDeleteBy,
    "2026-11-05T22:50:00.000Z"
  )
  for (const invalid of [
    // Registration after upload started leaves bytes outside the catalog.
    {
      slot: "2026-11-04T12:00:00.000Z",
      registeredAt: "2026-11-04T12:06:00.000Z",
      uploadStartedAt: "2026-11-04T12:05:00.000Z",
    },
    // Uploads after the 20-minute deadline must abort instead.
    {
      slot: "2026-11-04T12:00:00.000Z",
      registeredAt: "2026-11-04T12:19:00.000Z",
      uploadStartedAt: "2026-11-04T12:20:00.001Z",
    },
    {
      slot: "2026-11-04T12:15:00.000Z",
      registeredAt: "2026-11-04T12:16:00.000Z",
      uploadStartedAt: "2026-11-04T12:16:00.000Z",
    },
    {
      slot: "2026-11-04T12:00:00.000Z",
      registeredAt: "2026-11-04T11:59:59.999Z",
      uploadStartedAt: "2026-11-04T12:01:00.000Z",
    },
  ])
    assert.throws(
      () => registerCheckpointAttempt({ attemptId: "attempt-x", ...invalid }),
      /NEON_RECOVERY_CONTRACT_REJECTED/
    )
})

test("restore pins last at most four hours and never pass the hard deadline", () => {
  const requestedAt = "2026-11-10T00:00:00.000Z"
  const hardDeleteBy = "2026-11-12T11:20:00.000Z"
  assert.deepEqual(
    assertRestorePin({
      requestedAt,
      pinUntil: "2026-11-10T04:00:00.000Z",
      hardDeleteBy,
    }),
    { pinUntil: "2026-11-10T04:00:00.000Z" }
  )
  for (const pinUntil of [
    "2026-11-10T04:00:00.001Z",
    "2026-11-10T00:00:00.000Z",
    "2026-11-09T23:00:00.000Z",
  ])
    assert.throws(
      () => assertRestorePin({ requestedAt, pinUntil, hardDeleteBy }),
      /NEON_RECOVERY_CONTRACT_REJECTED/
    )
  assert.throws(
    () =>
      assertRestorePin({
        requestedAt: "2026-11-12T09:00:00.000Z",
        pinUntil: "2026-11-12T12:00:00.000Z",
        hardDeleteBy,
      }),
    /NEON_RECOVERY_CONTRACT_REJECTED/
  )
})

test("garbage collection keeps locked, referenced or pinned copies until the hard deadline", () => {
  const base = {
    now: "2026-11-11T00:00:00.000Z",
    lockUntil: "2026-11-10T00:00:00.000Z",
    referenced: false,
    pinnedUntil: null,
    hardDeleteBy: "2026-11-12T11:20:00.000Z",
  }
  assert.equal(garbageCollectionDecision(base), "delete")
  assert.equal(
    garbageCollectionDecision({
      ...base,
      lockUntil: "2026-11-11T00:00:00.001Z",
    }),
    "retain"
  )
  assert.equal(
    garbageCollectionDecision({ ...base, referenced: true }),
    "retain"
  )
  assert.equal(
    garbageCollectionDecision({
      ...base,
      pinnedUntil: "2026-11-11T01:00:00.000Z",
    }),
    "retain"
  )
  const atDeadline = { ...base, now: "2026-11-12T11:20:00.000Z" }
  // A stale reference or pin never keeps deleted bytes past the deadline.
  assert.equal(
    garbageCollectionDecision({ ...atDeadline, referenced: true }),
    "delete"
  )
  // A lock outliving the deadline is a contract violation, not a retention.
  assert.equal(
    garbageCollectionDecision({
      ...atDeadline,
      lockUntil: "2026-11-12T11:20:00.001Z",
    }),
    "incident"
  )
})
