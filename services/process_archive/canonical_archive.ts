import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type {
  ArchiveClickHouseBatch,
  ArchiveClickHouseManifest,
  ArchivePolicyDecisions,
} from './archive_clickhouse'

const SCHEMA_VERSION = 'canonical_ingest_v1'
const SOURCE = 'archive_upload'
const REPORT_VERSION = 1
const MAX_BATCH_SIZE = 100

type CanonicalEntityType =
  | 'account'
  | 'tweet_content'
  | 'tweet_engagement'
  | 'media'
  | 'url'
  | 'mention'
  | 'relationship'

export interface CanonicalIngestEvent {
  event_id: string
  schema_version: typeof SCHEMA_VERSION
  source: typeof SOURCE
  source_run_id: string
  source_event_id: string
  entity_type: CanonicalEntityType
  entity_key: string
  operation: 'upsert' | 'tombstone'
  observed_at: string
  emitted_at: string
  version: string
  policy_version: string
  payload: Record<string, unknown>
  payload_hash: string
}

interface CanonicalPublishReport {
  schema_version: typeof REPORT_VERSION
  archive_upload_id: string
  source_run_id: string
  status: 'pending' | 'publishing' | 'failed' | 'complete'
  event_count: number
  policy_version: string
  completed_batches: Record<
    string,
    { event_count: number; duplicate_count: number; completed_at: string }
  >
  updated_at: string
  last_error_code?: string
}

interface PublisherConfig {
  endpoint: string
  apiKey: string
  batchSize: number
  timeoutMs: number
}

type FetchLike = typeof fetch

const TABLE_ENTITY_TYPES: Partial<
  Record<keyof ArchiveClickHouseBatch, CanonicalEntityType>
> = {
  account_observations: 'account',
  tweet_content_versions: 'tweet_content',
  tweet_engagement_observations: 'tweet_engagement',
  tweet_archive_provenance: 'relationship',
  tweet_mentions: 'mention',
  tweet_relationships: 'relationship',
  tweet_media_versions: 'media',
  tweet_url_versions: 'url',
}

export class CanonicalArchivePublisherError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'CanonicalArchivePublisherError'
  }
}

export function canonicalArchiveShadowEnabled(): boolean {
  return process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED === 'true'
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function assertPlainObject(
  value: unknown,
  description: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new CanonicalArchivePublisherError(`${description}_not_plain_json`)
  }
}

function assertValidUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new CanonicalArchivePublisherError('invalid_unicode')
      }
      index += 1
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new CanonicalArchivePublisherError('invalid_unicode')
    }
  }
}

function serializeCanonicalJson(
  value: unknown,
  ancestors: Set<object>,
): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'string') {
    assertValidUnicode(value)
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CanonicalArchivePublisherError('non_finite_number')
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new CanonicalArchivePublisherError('cyclic_json')
    }
    ancestors.add(value)
    try {
      return `[${value
        .map((item) => serializeCanonicalJson(item, ancestors))
        .join(',')}]`
    } finally {
      ancestors.delete(value)
    }
  }
  assertPlainObject(value, 'canonical_payload')
  if (ancestors.has(value)) {
    throw new CanonicalArchivePublisherError('cyclic_json')
  }
  ancestors.add(value)
  try {
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        assertValidUnicode(key)
        if (value[key] === undefined) {
          throw new CanonicalArchivePublisherError('undefined_json_value')
        }
        return `${JSON.stringify(key)}:${serializeCanonicalJson(
          value[key],
          ancestors,
        )}`
      })
      .join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

export function canonicalJson(value: unknown): string {
  return serializeCanonicalJson(value, new Set())
}

function versionForObservedAt(observedAt: string): string {
  const milliseconds = Date.parse(observedAt)
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new CanonicalArchivePublisherError('invalid_observed_at')
  }
  return String(milliseconds)
}

function payloadWithoutProjectionMetadata(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const payload = Object.fromEntries(
    Object.entries(row).filter(
      ([key]) => !['event_id', 'source', 'observed_at'].includes(key),
    ),
  )
  if (typeof payload.is_tombstone === 'number') {
    payload.is_tombstone = payload.is_tombstone === 1
  }
  return payload
}

function entityKey(
  entityType: CanonicalEntityType,
  payload: Record<string, unknown>,
): string {
  if (entityType === 'account') return String(payload.account_id)
  if (entityType === 'tweet_content' || entityType === 'tweet_engagement') {
    return String(payload.tweet_id)
  }
  if (entityType === 'mention') {
    return `${payload.tweet_id}|${payload.mentioned_account_id}`
  }
  if (entityType === 'media') return String(payload.media_id)
  if (entityType === 'url') return `${payload.tweet_id}|${payload.url}`
  if (payload.archive_upload_id !== undefined) {
    return `${payload.tweet_id}|archive_provenance|${payload.archive_upload_id}`
  }
  return `${payload.tweet_id}|${payload.relationship_type}|${payload.related_tweet_id}`
}

function createEvent(
  input: Omit<CanonicalIngestEvent, 'event_id' | 'payload_hash'>,
) {
  const payloadHash = sha256(canonicalJson(input.payload))
  const eventId = sha256(
    [
      input.schema_version,
      input.source,
      input.source_run_id,
      input.source_event_id,
      input.entity_type,
      input.entity_key,
      input.operation,
      input.version,
      payloadHash,
    ].join('\0'),
  )
  return { ...input, event_id: eventId, payload_hash: payloadHash }
}

export function buildCanonicalArchiveEvents(
  batch: ArchiveClickHouseBatch,
  manifest: ArchiveClickHouseManifest,
  policyVersion: string,
  emittedAt = new Date().toISOString(),
): CanonicalIngestEvent[] {
  const sourceRunId = `archive:${manifest.archiveUploadId}`
  const tweetAuthors = new Map(
    batch.tweet_content_versions.map((row) => [
      String(row.tweet_id),
      String(row.account_id),
    ]),
  )
  const tombstonedTweets = new Set(
    batch.tweet_content_versions
      .filter((row) => row.is_tombstone === 1)
      .map((row) => String(row.tweet_id)),
  )
  const byEntity = new Map<string, CanonicalIngestEvent>()

  for (const [table, rows] of Object.entries(batch) as [
    keyof ArchiveClickHouseBatch,
    Record<string, unknown>[],
  ][]) {
    const entityType = TABLE_ENTITY_TYPES[table]
    if (!entityType) continue
    for (const row of rows) {
      const payload = payloadWithoutProjectionMetadata(row)
      if (payload.account_id === undefined) {
        const author = tweetAuthors.get(String(payload.tweet_id ?? ''))
        if (!author) {
          throw new CanonicalArchivePublisherError('policy_author_missing')
        }
        payload.account_id = author
      } else {
        payload.account_id = String(payload.account_id)
      }
      if (
        table === 'tweet_archive_provenance' &&
        tombstonedTweets.has(String(payload.tweet_id))
      ) {
        payload.is_tombstone = true
      }
      const key = entityKey(entityType, payload)
      const observedAt = String(row.observed_at ?? '')
      const event = createEvent({
        schema_version: SCHEMA_VERSION,
        source: SOURCE,
        source_run_id: sourceRunId,
        source_event_id: String(row.event_id ?? ''),
        entity_type: entityType,
        entity_key: key,
        operation: payload.is_tombstone === true ? 'tombstone' : 'upsert',
        observed_at: observedAt,
        emitted_at: emittedAt,
        version: versionForObservedAt(observedAt),
        policy_version: policyVersion,
        payload,
      })
      byEntity.set(`${entityType}\0${key}`, event)
    }
  }

  return [...byEntity.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, event]) => event)
}

export function canonicalArchivePolicyVersion(
  manifest: ArchiveClickHouseManifest,
  ownerBlocked: boolean,
  decisions: ArchivePolicyDecisions,
): string {
  const relevantPolicy = [
    `owner:${manifest.accountId}:${ownerBlocked ? 1 : 0}`,
    ...[...decisions.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(
        ([key, decision]) =>
          `${key}:${decision.accountId ?? ''}:${decision.blocked ? 1 : 0}`,
      ),
  ].join('\n')
  return `archive-policy-v1:${sha256(relevantPolicy)}`
}

function positiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value) || value <= 0) {
    throw new CanonicalArchivePublisherError(`${name.toLowerCase()}_invalid`)
  }
  return value
}

function publisherConfig(): PublisherConfig {
  const endpoint = process.env.CANONICAL_PUBLISH_URL?.trim() ?? ''
  const apiKey = process.env.CANONICAL_PUBLISHER_API_KEY?.trim() ?? ''
  if (!endpoint || !apiKey) {
    throw new CanonicalArchivePublisherError('canonical_configuration_missing')
  }
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new CanonicalArchivePublisherError('canonical_url_invalid')
  }
  if (
    url.protocol !== 'https:' &&
    !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)
  ) {
    throw new CanonicalArchivePublisherError('canonical_https_required')
  }
  const batchSize = positiveNumber('CANONICAL_PUBLISH_BATCH_SIZE', 100)
  const timeoutSeconds = positiveNumber('CANONICAL_PUBLISH_TIMEOUT_SECONDS', 30)
  if (!Number.isSafeInteger(batchSize) || batchSize > MAX_BATCH_SIZE) {
    throw new CanonicalArchivePublisherError('canonical_batch_size_invalid')
  }
  if (timeoutSeconds > 120) {
    throw new CanonicalArchivePublisherError('canonical_timeout_invalid')
  }
  return {
    endpoint,
    apiKey,
    batchSize,
    timeoutMs: timeoutSeconds * 1_000,
  }
}

export function canonicalArchiveReportPath(
  reportDir: string,
  archiveUploadId: string,
): string {
  if (!/^(0|[1-9][0-9]*)$/.test(archiveUploadId)) {
    throw new CanonicalArchivePublisherError('archive_upload_id_invalid')
  }
  return path.join(reportDir, `canonical_archive_${archiveUploadId}.json`)
}

function newReport(
  manifest: ArchiveClickHouseManifest,
  eventCount: number,
  policyVersion: string,
): CanonicalPublishReport {
  return {
    schema_version: REPORT_VERSION,
    archive_upload_id: manifest.archiveUploadId,
    source_run_id: `archive:${manifest.archiveUploadId}`,
    status: 'publishing',
    event_count: eventCount,
    policy_version: policyVersion,
    completed_batches: {},
    updated_at: new Date().toISOString(),
  }
}

function loadReport(
  reportPath: string,
  manifest: ArchiveClickHouseManifest,
  eventCount: number,
  policyVersion: string,
): CanonicalPublishReport {
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    if (
      report.schema_version === REPORT_VERSION &&
      report.archive_upload_id === manifest.archiveUploadId &&
      report.source_run_id === `archive:${manifest.archiveUploadId}` &&
      report.completed_batches !== null &&
      typeof report.completed_batches === 'object' &&
      !Array.isArray(report.completed_batches)
    ) {
      return {
        ...report,
        status: 'publishing',
        event_count: eventCount,
        policy_version: policyVersion,
        updated_at: new Date().toISOString(),
      }
    }
  } catch {}
  return newReport(manifest, eventCount, policyVersion)
}

function writeReport(reportPath: string, report: CanonicalPublishReport): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  const temporaryPath = `${reportPath}.${process.pid}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    const handle = fs.openSync(temporaryPath, 'r')
    try {
      fs.fsyncSync(handle)
    } finally {
      fs.closeSync(handle)
    }
    fs.renameSync(temporaryPath, reportPath)
  } finally {
    try {
      fs.unlinkSync(temporaryPath)
    } catch {}
  }
}

export function ensureCanonicalArchivePendingReport(
  archiveUploadId: string,
  reportDir: string,
): void {
  const reportPath = canonicalArchiveReportPath(reportDir, archiveUploadId)
  if (fs.existsSync(reportPath)) return
  writeReport(reportPath, {
    schema_version: REPORT_VERSION,
    archive_upload_id: archiveUploadId,
    source_run_id: `archive:${archiveUploadId}`,
    status: 'pending',
    event_count: 0,
    policy_version: 'pending',
    completed_batches: {},
    updated_at: new Date().toISOString(),
    last_error_code: 'canonical_archive_pending',
  })
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size))
  }
  return result
}

function batchHash(events: CanonicalIngestEvent[]): string {
  return sha256(events.map((event) => event.event_id).join('\n'))
}

async function postBatch(
  config: PublisherConfig,
  events: CanonicalIngestEvent[],
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
    throw new CanonicalArchivePublisherError('canonical_request_failed')
  }
  if (response.status !== 202) {
    throw new CanonicalArchivePublisherError(
      `canonical_http_${response.status}`,
    )
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new CanonicalArchivePublisherError('canonical_response_invalid')
  }
  assertPlainObject(body, 'canonical_response')
  if (!Array.isArray(body.accepted) || body.accepted.length !== events.length) {
    throw new CanonicalArchivePublisherError('canonical_receipts_incomplete')
  }
  const receipts = body.accepted as Record<string, unknown>[]
  const expectedIds = new Set(events.map((event) => event.event_id))
  const receivedIds = new Set(
    receipts.map((receipt) => String(receipt.event_id)),
  )
  if (
    receivedIds.size !== expectedIds.size ||
    [...expectedIds].some((eventId) => !receivedIds.has(eventId)) ||
    receipts.some(
      (receipt) =>
        !expectedIds.has(String(receipt.event_id)) ||
        typeof receipt.duplicate !== 'boolean',
    )
  ) {
    throw new CanonicalArchivePublisherError('canonical_receipts_invalid')
  }
  return receipts.filter((receipt) => receipt.duplicate === true).length
}

export async function publishCanonicalArchiveBatch(options: {
  batch: ArchiveClickHouseBatch
  manifest: ArchiveClickHouseManifest
  policyVersion: string
  reportDir: string
  fetchImpl?: FetchLike
}): Promise<CanonicalPublishReport | { status: 'disabled' }> {
  if (!canonicalArchiveShadowEnabled()) return { status: 'disabled' }
  const config = publisherConfig()
  const events = buildCanonicalArchiveEvents(
    options.batch,
    options.manifest,
    options.policyVersion,
  )
  const reportPath = canonicalArchiveReportPath(
    options.reportDir,
    options.manifest.archiveUploadId,
  )
  const report = loadReport(
    reportPath,
    options.manifest,
    events.length,
    options.policyVersion,
  )
  writeReport(reportPath, report)

  try {
    for (const eventBatch of chunks(events, config.batchSize)) {
      const hash = batchHash(eventBatch)
      if (report.completed_batches[hash]) continue
      const duplicateCount = await postBatch(
        config,
        eventBatch,
        options.fetchImpl ?? fetch,
      )
      report.completed_batches[hash] = {
        event_count: eventBatch.length,
        duplicate_count: duplicateCount,
        completed_at: new Date().toISOString(),
      }
      report.updated_at = new Date().toISOString()
      writeReport(reportPath, report)
    }
    report.status = 'complete'
    delete report.last_error_code
    report.updated_at = new Date().toISOString()
    writeReport(reportPath, report)
    return report
  } catch (error) {
    report.status = 'failed'
    report.last_error_code = safeCanonicalArchiveErrorCode(error)
    report.updated_at = new Date().toISOString()
    writeReport(reportPath, report)
    throw error
  }
}

export function safeCanonicalArchiveErrorCode(error: unknown): string {
  return error instanceof CanonicalArchivePublisherError
    ? error.code
    : 'canonical_archive_publish_failed'
}

export function pendingCanonicalArchiveReportIds(reportDir: string): string[] {
  try {
    return fs
      .readdirSync(reportDir)
      .map((name) => name.match(/^canonical_archive_(\d+)\.json$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .filter((archiveUploadId) => {
        try {
          const report = JSON.parse(
            fs.readFileSync(
              canonicalArchiveReportPath(reportDir, archiveUploadId),
              'utf8',
            ),
          )
          return report.status !== 'complete'
        } catch {
          return true
        }
      })
      .sort((left, right) =>
        BigInt(left) < BigInt(right)
          ? -1
          : BigInt(left) > BigInt(right)
            ? 1
            : 0,
      )
  } catch {
    return []
  }
}
