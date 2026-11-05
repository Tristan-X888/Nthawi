import { sign, verify } from "node:crypto"

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

export const recoveryPolicy = Object.freeze({
  version: "phase4-v1",
  contentCleanupMs: 15 * minute,
  checkpointDeadlineMs: 20 * minute,
  ordinaryDumpLockMs: 28 * hour,
  longDumpLockMs: 185 * hour,
  journalLockMs: 186 * hour,
  objectLockMs: 7 * day,
  liveCopyRefreshMs: 5.5 * day,
  liveCopyMaximumAgeMs: 6 * day,
  minimumRemainingLockMs: day,
  maximumRestorePinMs: 4 * hour,
  garbageCollectionMs: 6 * hour,
  deletedBytesCeilingMs: 8 * day,
  maximumDeletedDatabaseBytesMs:
    15 * minute + 185 * hour + 20 * minute + 6 * hour,
})

function reject() {
  throw new Error("NEON_RECOVERY_CONTRACT_REJECTED")
}

function instant(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  )
    reject()
  const result = Date.parse(value)
  if (!Number.isFinite(result) || new Date(result).toISOString() !== value)
    reject()
  return result
}

// Canonical byte representation is part of the signed wire contract. Never sign
// ordinary JSON.stringify output with an unspecified property order.
export function canonicalRecoveryJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value)
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) reject()
    return String(value)
  }
  if (Array.isArray(value))
    return `[${value.map(canonicalRecoveryJson).join(",")}]`
  if (
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    reject()
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalRecoveryJson(value[key])}`)
    .join(",")}}`
}

function signedBytes(payload) {
  return Buffer.from(`Nthawi recovery/v1\n${canonicalRecoveryJson(payload)}`)
}

export function signRecoveryEnvelope(payload, privateKey) {
  if (privateKey.asymmetricKeyType !== "ed25519") reject()
  return {
    payload,
    signature: sign(null, signedBytes(payload), privateKey).toString(
      "base64url"
    ),
  }
}

export function verifyRecoveryEnvelope(envelope, publicKey, type, environment) {
  try {
    if (
      publicKey.asymmetricKeyType !== "ed25519" ||
      !envelope ||
      Object.keys(envelope).sort().join(",") !== "payload,signature" ||
      !/^[A-Za-z0-9_-]{86}$/.test(envelope.signature) ||
      envelope.payload?.version !== recoveryPolicy.version ||
      envelope.payload.type !== type ||
      !["staging", "production", "test"].includes(environment) ||
      envelope.payload.environment !== environment ||
      !verify(
        null,
        signedBytes(envelope.payload),
        publicKey,
        Buffer.from(envelope.signature, "base64url")
      )
    )
      reject()
    return envelope.payload
  } catch {
    reject()
  }
}

export function checkpointTiming({ slot, snapshotAt, completedAt }) {
  const start = instant(slot)
  const snapshot = instant(snapshotAt)
  const complete = instant(completedAt)
  const date = new Date(start)
  if (
    ![0, 30].includes(date.getUTCMinutes()) ||
    date.getUTCSeconds() !== 0 ||
    date.getUTCMilliseconds() !== 0 ||
    snapshot < start ||
    complete < snapshot ||
    complete > start + recoveryPolicy.checkpointDeadlineMs
  )
    reject()
  const longPoint =
    date.getUTCMinutes() === 0 && [0, 12].includes(date.getUTCHours())
  return {
    longPoint,
    usableUntil: new Date(
      snapshot + (longPoint ? 180 * hour : 24 * hour)
    ).toISOString(),
    // Lock age starts when the object is created, bounded by completedAt.
    lockUntil: new Date(
      complete +
        (longPoint
          ? recoveryPolicy.longDumpLockMs
          : recoveryPolicy.ordinaryDumpLockMs)
    ).toISOString(),
    hardDeleteBy: new Date(
      snapshot +
        recoveryPolicy.checkpointDeadlineMs +
        (longPoint
          ? recoveryPolicy.longDumpLockMs
          : recoveryPolicy.ordinaryDumpLockMs) +
        recoveryPolicy.garbageCollectionMs
    ).toISOString(),
  }
}

function matches(payload, expected, keys) {
  if (keys.some((key) => payload[key] !== expected[key])) reject()
}

const deletionScopes = new Set([
  "account",
  "workspace",
  "source",
  "revision",
  "conversation",
  "message",
  "credential",
  "grant",
])
function identity(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 512 &&
    !/[\x00-\x1f\x7f]/.test(value)
  )
}

export function assertCopyBeforeAcknowledgement(
  envelope,
  publicKey,
  expected,
  now
) {
  const payload = verifyRecoveryEnvelope(
    envelope,
    publicKey,
    "object-copy",
    expected.environment
  )
  matches(payload, expected, [
    "operationId",
    "resourceId",
    "generation",
    "sha256",
    "bytes",
  ])
  if (
    !/^[a-f0-9]{64}$/.test(payload.sha256) ||
    !Number.isSafeInteger(payload.bytes) ||
    payload.bytes < 0 ||
    !Number.isSafeInteger(payload.generation) ||
    payload.generation < 1 ||
    !identity(payload.operationId) ||
    !identity(payload.resourceId) ||
    payload.durable !== true ||
    expected.deleted === true
  )
    reject()
  const current = instant(now)
  const created = instant(payload.createdAt)
  const locked = instant(payload.lockUntil)
  if (
    created > current ||
    current - created > recoveryPolicy.liveCopyMaximumAgeMs ||
    locked !== created + recoveryPolicy.objectLockMs ||
    locked - current < recoveryPolicy.minimumRemainingLockMs
  )
    reject()
  return {
    acknowledgementAllowed: true,
    refreshRequired: current - created >= recoveryPolicy.liveCopyRefreshMs,
  }
}

export function assertDeletionReceiptBeforeCommit(
  envelope,
  publicKey,
  expected,
  now
) {
  const payload = verifyRecoveryEnvelope(
    envelope,
    publicKey,
    "deletion-intent",
    expected.environment
  )
  matches(payload, expected, [
    "operationId",
    "resourceId",
    "generation",
    "scope",
  ])
  if (
    !Number.isSafeInteger(payload.generation) ||
    payload.generation < 1 ||
    !identity(payload.operationId) ||
    !identity(payload.resourceId) ||
    !deletionScopes.has(payload.scope) ||
    !Number.isSafeInteger(payload.sequence) ||
    payload.sequence < 1 ||
    payload.durable !== true ||
    !identity(payload.receiptId) ||
    expected.lockedGeneration !== payload.generation ||
    instant(payload.createdAt) > instant(now)
  )
    reject()
  return {
    receiptId: payload.receiptId,
    sequence: payload.sequence,
    generation: payload.generation,
  }
}

export function assertContiguousJournalTail(
  { environment, watermark, latestSequence, entries, head, now },
  publicKey
) {
  // A caller-selected number cannot prove that no later deletion exists.
  // Require the independent journal's signed current high-water response.
  const currentHead = verifyRecoveryEnvelope(
    head,
    publicKey,
    "journal-head",
    environment
  )
  if (
    currentHead.latestSequence !== latestSequence ||
    currentHead.durable !== true ||
    instant(currentHead.observedAt) > instant(now) ||
    instant(now) - instant(currentHead.observedAt) > 60_000
  )
    reject()
  if (
    !Number.isSafeInteger(watermark) ||
    watermark < 0 ||
    !Number.isSafeInteger(latestSequence) ||
    latestSequence < watermark ||
    !Array.isArray(entries) ||
    entries.length !== latestSequence - watermark
  )
    reject()
  const operations = new Set()
  const receipts = new Set()
  const generations = new Map()
  return entries.map((envelope, index) => {
    const payload = verifyRecoveryEnvelope(
      envelope,
      publicKey,
      "deletion-intent",
      environment
    )
    if (
      payload.sequence !== watermark + index + 1 ||
      !identity(payload.operationId) ||
      !identity(payload.resourceId) ||
      !deletionScopes.has(payload.scope) ||
      operations.has(payload.operationId) ||
      !identity(payload.receiptId) ||
      receipts.has(payload.receiptId) ||
      payload.durable !== true ||
      !Number.isSafeInteger(payload.generation) ||
      payload.generation < 1
    )
      reject()
    instant(payload.createdAt)
    const resource = `${payload.scope}:${payload.resourceId}`
    if (payload.generation < (generations.get(resource) ?? 0)) reject()
    generations.set(resource, payload.generation)
    operations.add(payload.operationId)
    receipts.add(payload.receiptId)
    // An independently receipted intent with unknown DB commit is deny-only.
    // This is deliberately not a payment/AI/outbox replay instruction.
    return { ...payload, restoreAction: "deny-until-reconciled" }
  })
}

export function assertCheckpointPublication({
  catalogRegisteredBeforeUpload,
  manifest,
  envelope,
  publicKey,
  environment,
  expectedDumpHash,
  now,
}) {
  if (catalogRegisteredBeforeUpload !== true) reject()
  const payload = verifyRecoveryEnvelope(
    envelope,
    publicKey,
    "checkpoint",
    environment
  )
  if (
    canonicalRecoveryJson(payload) !== canonicalRecoveryJson(manifest) ||
    payload.dumpSha256 !== expectedDumpHash ||
    !/^[a-f0-9]{64}$/.test(expectedDumpHash) ||
    payload.complete !== true ||
    payload.objectCoverageVerified !== true ||
    payload.contiguousJournalVerified !== true ||
    instant(now) < instant(payload.completedAt)
  )
    reject()
  return checkpointTiming(payload)
}

// Deleted database bytes: 15-minute content cleanup lag, plus the longest dump
// lock (185 h) measured from object creation, which may finish up to 20 minutes
// after its slot, plus a garbage-collection run within 6 hours (P3-U05).
export function deletedDatabaseByteBound() {
  const cleanupMs = recoveryPolicy.contentCleanupMs
  const longLockMs = recoveryPolicy.longDumpLockMs
  const creationDelayMs = recoveryPolicy.checkpointDeadlineMs
  const garbageCollectionMs = recoveryPolicy.garbageCollectionMs
  const totalMs = cleanupMs + longLockMs + creationDelayMs + garbageCollectionMs
  const ceilingMs = recoveryPolicy.deletedBytesCeilingMs
  if (totalMs !== recoveryPolicy.maximumDeletedDatabaseBytesMs) reject()
  return {
    cleanupMs,
    longLockMs,
    creationDelayMs,
    garbageCollectionMs,
    totalMs,
    ceilingMs,
    marginMs: ceilingMs - totalMs,
    withinCeiling: totalMs < ceilingMs,
  }
}

function slotStart(value) {
  const start = instant(value)
  const date = new Date(start)
  if (
    ![0, 30].includes(date.getUTCMinutes()) ||
    date.getUTCSeconds() !== 0 ||
    date.getUTCMilliseconds() !== 0
  )
    reject()
  return {
    start,
    longPoint:
      date.getUTCMinutes() === 0 && [0, 12].includes(date.getUTCHours()),
  }
}

/**
 * Every attempt, including ones that never complete, is catalogued before any
 * byte is uploaded. Its hard deletion deadline follows from its slot, because
 * no object may be created after the slot's 20-minute deadline.
 */
export function registerCheckpointAttempt({
  attemptId,
  slot,
  registeredAt,
  uploadStartedAt,
}) {
  if (!identity(attemptId)) reject()
  const { start, longPoint } = slotStart(slot)
  const registered = instant(registeredAt)
  const upload = instant(uploadStartedAt)
  if (
    registered < start ||
    registered > upload ||
    upload > start + recoveryPolicy.checkpointDeadlineMs
  )
    reject()
  const lock = longPoint
    ? recoveryPolicy.longDumpLockMs
    : recoveryPolicy.ordinaryDumpLockMs
  return {
    attemptId,
    slot,
    longPoint,
    hardDeleteBy: new Date(
      start +
        recoveryPolicy.checkpointDeadlineMs +
        lock +
        recoveryPolicy.garbageCollectionMs
    ).toISOString(),
  }
}

/** A restore pin is bounded and can never outlive the hard deletion deadline. */
export function assertRestorePin({ requestedAt, pinUntil, hardDeleteBy }) {
  const requested = instant(requestedAt)
  const until = instant(pinUntil)
  const deadline = instant(hardDeleteBy)
  if (
    until <= requested ||
    until - requested > recoveryPolicy.maximumRestorePinMs ||
    until > deadline
  )
    reject()
  return { pinUntil }
}

/**
 * GC keeps locked, manifest-referenced or pinned copies, but at the hard
 * deadline deleted bytes go regardless of stale references; a lock that
 * outlives the deadline is an incident.
 */
export function garbageCollectionDecision({
  now,
  lockUntil,
  referenced,
  pinnedUntil,
  hardDeleteBy,
}) {
  const current = instant(now)
  const lock = instant(lockUntil)
  const deadline = instant(hardDeleteBy)
  const pinned =
    pinnedUntil === null || pinnedUntil === undefined
      ? null
      : instant(pinnedUntil)
  if (typeof referenced !== "boolean") reject()
  const locked = current < lock
  if (current >= deadline) return locked ? "incident" : "delete"
  if (locked || referenced || (pinned !== null && pinned > current))
    return "retain"
  return "delete"
}
