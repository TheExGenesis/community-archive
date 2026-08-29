import { createHash } from 'node:crypto'

const SCHEMA_VERSION = 'canonical_ingest_v1'
const SOURCE = 'admin_delete'
const MAX_BATCH_SIZE = 100

type CanonicalAdminEntityType = 'account' | 'tweet_content'

export interface CanonicalAdminDeleteEvent {
  event_id: string
  schema_version: typeof SCHEMA_VERSION
  source: typeof SOURCE
  source_run_id: string
  source_event_id: string
  entity_type: CanonicalAdminEntityType
  entity_key: string
  operation: 'tombstone'
  observed_at: string
  emitted_at: string
  version: string
  policy_version: string
  payload: Record<string, unknown>
  payload_hash: string
}

export interface CanonicalAdminDeleteInput {
  jobKey: string
  accountId?: string | null
  tweetIds: string[]
  observedAt: string
}

interface PublisherConfig {
  endpoint: string
  apiKey: string
  batchSize: number
  timeoutMs: number
}

type FetchLike = typeof fetch

export class CanonicalAdminDeleteShadowError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'CanonicalAdminDeleteShadowError'
  }
}

export function canonicalAdminDeleteShadowEnabled(): boolean {
  return process.env.CANONICAL_ADMIN_DELETE_SHADOW_PUBLISH_ENABLED === 'true'
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function assertValidUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new CanonicalAdminDeleteShadowError('invalid_unicode')
      }
      index += 1
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new CanonicalAdminDeleteShadowError('invalid_unicode')
    }
  }
}

function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'string') {
    assertValidUnicode(value)
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CanonicalAdminDeleteShadowError('non_finite_number')
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new CanonicalAdminDeleteShadowError('cyclic_json')
    }
    ancestors.add(value)
    try {
      return `[${value.map((item) => canonicalJson(item, ancestors)).join(',')}]`
    } finally {
      ancestors.delete(value)
    }
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new CanonicalAdminDeleteShadowError('payload_not_plain_json')
  }
  if (ancestors.has(value)) {
    throw new CanonicalAdminDeleteShadowError('cyclic_json')
  }
  ancestors.add(value)
  try {
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        assertValidUnicode(key)
        const child = (value as Record<string, unknown>)[key]
        if (child === undefined) {
          throw new CanonicalAdminDeleteShadowError('undefined_json_value')
        }
        return `${JSON.stringify(key)}:${canonicalJson(child, ancestors)}`
      })
      .join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

function versionForObservedAt(observedAt: string): string {
  const milliseconds = Date.parse(observedAt)
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new CanonicalAdminDeleteShadowError('invalid_observed_at')
  }
  return String(milliseconds)
}

function createEvent(input: {
  sourceRunId: string
  sourceEventId: string
  entityType: CanonicalAdminEntityType
  entityKey: string
  observedAt: string
  emittedAt: string
  version: string
  policyVersion: string
  payload: Record<string, unknown>
}): CanonicalAdminDeleteEvent {
  const payloadHash = sha256(canonicalJson(input.payload))
  const eventWithoutIdentity: Omit<
    CanonicalAdminDeleteEvent,
    'event_id' | 'payload_hash'
  > = {
    schema_version: SCHEMA_VERSION,
    source: SOURCE,
    source_run_id: input.sourceRunId,
    source_event_id: input.sourceEventId,
    entity_type: input.entityType,
    entity_key: input.entityKey,
    operation: 'tombstone' as const,
    observed_at: input.observedAt,
    emitted_at: input.emittedAt,
    version: input.version,
    policy_version: input.policyVersion,
    payload: input.payload,
  }
  return {
    ...eventWithoutIdentity,
    payload_hash: payloadHash,
    event_id: sha256(
      [
        eventWithoutIdentity.schema_version,
        eventWithoutIdentity.source,
        eventWithoutIdentity.source_run_id,
        eventWithoutIdentity.source_event_id,
        eventWithoutIdentity.entity_type,
        eventWithoutIdentity.entity_key,
        eventWithoutIdentity.operation,
        eventWithoutIdentity.version,
        payloadHash,
      ].join('\0'),
    ),
  }
}

export function buildCanonicalAdminDeleteEvents(
  input: CanonicalAdminDeleteInput,
  emittedAt = new Date().toISOString(),
): CanonicalAdminDeleteEvent[] {
  const accountId = input.accountId?.trim()
  if (!accountId) return []
  const version = versionForObservedAt(input.observedAt)
  const sourceRunId = `admin-delete:${input.jobKey}`
  const policyVersion = `admin-delete-policy-v1:${sha256(
    `${accountId}\0${input.observedAt}`,
  )}`
  const accountEvent = createEvent({
    sourceRunId,
    sourceEventId: `account:${accountId}`,
    entityType: 'account',
    entityKey: accountId,
    observedAt: input.observedAt,
    emittedAt,
    version,
    policyVersion,
    payload: { account_id: accountId, is_tombstone: true },
  })
  const tweetEvents = [...new Set(input.tweetIds.map(String))]
    .sort()
    .map((tweetId) =>
      createEvent({
        sourceRunId,
        sourceEventId: `tweet:${tweetId}`,
        entityType: 'tweet_content',
        entityKey: tweetId,
        observedAt: input.observedAt,
        emittedAt,
        version,
        policyVersion,
        payload: {
          tweet_id: tweetId,
          account_id: accountId,
          full_text: '',
          is_tombstone: true,
        },
      }),
    )
  return [accountEvent, ...tweetEvents]
}

function positiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value) || value <= 0) {
    throw new CanonicalAdminDeleteShadowError(`${name.toLowerCase()}_invalid`)
  }
  return value
}

function publisherConfig(): PublisherConfig {
  const endpoint = process.env.CANONICAL_PUBLISH_URL?.trim() ?? ''
  const apiKey = process.env.CANONICAL_PUBLISHER_API_KEY?.trim() ?? ''
  if (!endpoint || !apiKey) {
    throw new CanonicalAdminDeleteShadowError('canonical_configuration_missing')
  }
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new CanonicalAdminDeleteShadowError('canonical_url_invalid')
  }
  if (
    url.protocol !== 'https:' &&
    !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)
  ) {
    throw new CanonicalAdminDeleteShadowError('canonical_https_required')
  }
  const batchSize = positiveNumber('CANONICAL_PUBLISH_BATCH_SIZE', 100)
  const timeoutSeconds = positiveNumber('CANONICAL_PUBLISH_TIMEOUT_SECONDS', 30)
  if (!Number.isSafeInteger(batchSize) || batchSize > MAX_BATCH_SIZE) {
    throw new CanonicalAdminDeleteShadowError('canonical_batch_size_invalid')
  }
  if (timeoutSeconds > 120) {
    throw new CanonicalAdminDeleteShadowError('canonical_timeout_invalid')
  }
  return {
    endpoint: url.toString(),
    apiKey,
    batchSize,
    timeoutMs: timeoutSeconds * 1_000,
  }
}

function chunks<T>(values: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let offset = 0; offset < values.length; offset += size) {
    batches.push(values.slice(offset, offset + size))
  }
  return batches
}

async function publishBatch(
  config: PublisherConfig,
  events: CanonicalAdminDeleteEvent[],
  fetchImpl: FetchLike,
): Promise<number> {
  let response: Response
  try {
    response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
      },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch {
    throw new CanonicalAdminDeleteShadowError('canonical_request_failed')
  }
  if (response.status !== 202) {
    throw new CanonicalAdminDeleteShadowError(
      `canonical_response_${response.status}`,
    )
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new CanonicalAdminDeleteShadowError('canonical_receipt_invalid')
  }
  if (
    body === null ||
    typeof body !== 'object' ||
    !Array.isArray((body as { accepted?: unknown }).accepted)
  ) {
    throw new CanonicalAdminDeleteShadowError('canonical_receipt_invalid')
  }
  const receipts = (body as { accepted: unknown[] }).accepted
  const expected = new Set(events.map(({ event_id }) => event_id))
  const received = new Set(
    receipts.map((receipt) =>
      String((receipt as { event_id?: unknown })?.event_id),
    ),
  )
  if (
    receipts.length !== events.length ||
    received.size !== expected.size ||
    [...expected].some((eventId) => !received.has(eventId)) ||
    receipts.some(
      (receipt) =>
        typeof (receipt as { duplicate?: unknown })?.duplicate !== 'boolean',
    )
  ) {
    throw new CanonicalAdminDeleteShadowError('canonical_receipt_invalid')
  }
  return receipts.filter(
    (receipt) => (receipt as { duplicate: boolean }).duplicate,
  ).length
}

export async function publishCanonicalAdminDeleteShadow(
  input: CanonicalAdminDeleteInput,
  fetchImpl: FetchLike = fetch,
): Promise<{ eventCount: number; duplicateCount: number; skipped: boolean }> {
  if (!canonicalAdminDeleteShadowEnabled()) {
    return { eventCount: 0, duplicateCount: 0, skipped: true }
  }
  const events = buildCanonicalAdminDeleteEvents(input)
  if (events.length === 0) {
    return { eventCount: 0, duplicateCount: 0, skipped: true }
  }
  const config = publisherConfig()
  let duplicateCount = 0
  for (const batch of chunks(events, config.batchSize)) {
    duplicateCount += await publishBatch(config, batch, fetchImpl)
  }
  return { eventCount: events.length, duplicateCount, skipped: false }
}

export function canonicalAdminDeleteErrorCode(error: unknown): string {
  if (error instanceof CanonicalAdminDeleteShadowError) return error.code
  return error instanceof Error ? error.name : 'unknown_error'
}
