const SOURCE = 'admin_delete'
const MAX_BATCH_SIZE = 100

type CanonicalAdminEntityType = 'account' | 'tweet_content'

export interface CanonicalAdminDeleteMutation {
  source_event_id: string
  entity_type: CanonicalAdminEntityType
  entity_key: string
  operation: 'tombstone'
  version: string
  payload: Record<string, unknown>
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

function versionForObservedAt(observedAt: string): string {
  const milliseconds = Date.parse(observedAt)
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new CanonicalAdminDeleteShadowError('invalid_observed_at')
  }
  return String(milliseconds)
}

export function buildCanonicalAdminDeleteMutations(input: CanonicalAdminDeleteInput): CanonicalAdminDeleteMutation[] {
  const accountId = input.accountId?.trim()
  if (!accountId) return []
  if (!/^[1-9][0-9]*$/.test(accountId) || input.tweetIds.some((id) => !/^[1-9][0-9]*$/.test(id))) {
    throw new CanonicalAdminDeleteShadowError('canonical_identifiers_invalid')
  }
  const version = versionForObservedAt(input.observedAt)
  return [
    { source_event_id: `account:${accountId}`, entity_type: 'account', entity_key: accountId,
      operation: 'tombstone', version, payload: { account_id: accountId, is_tombstone: true } },
    ...[...new Set(input.tweetIds)].sort().map((tweetId): CanonicalAdminDeleteMutation => ({
      source_event_id: `tweet:${tweetId}`, entity_type: 'tweet_content', entity_key: tweetId,
      operation: 'tombstone', version, payload: { account_id: accountId, tweet_id: tweetId, is_tombstone: true },
    })),
  ]
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
  submission: { source: string; source_run_id: string; source_batch_id: string; observed_at: string; mutations: CanonicalAdminDeleteMutation[] },
  fetchImpl: FetchLike,
): Promise<number> {
  const requestBody = JSON.stringify({ batches: [submission] })
  if (Buffer.byteLength(requestBody) > 1_048_576) throw new CanonicalAdminDeleteShadowError('canonical_request_too_large')
  let response: Response
  try {
    response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
      },
      body: requestBody,
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
  const receipts = (body as { accepted: Record<string, unknown>[] }).accepted
  const receipt = receipts[0]
  if (receipts.length !== 1 || receipt?.source_batch_id !== submission.source_batch_id ||
      !/^[a-f0-9]{64}$/.test(String(receipt?.event_id ?? '')) ||
      !/^\d+-\d+$/.test(String(receipt?.message_id ?? '')) || typeof receipt?.duplicate !== 'boolean') {
    throw new CanonicalAdminDeleteShadowError('canonical_receipt_invalid')
  }
  return receipt.duplicate ? 1 : 0
}

export async function publishCanonicalAdminDeleteShadow(
  input: CanonicalAdminDeleteInput,
  fetchImpl: FetchLike = fetch,
): Promise<{ eventCount: number; duplicateCount: number; skipped: boolean }> {
  if (!canonicalAdminDeleteShadowEnabled()) {
    return { eventCount: 0, duplicateCount: 0, skipped: true }
  }
  const events = buildCanonicalAdminDeleteMutations(input)
  if (events.length === 0) {
    return { eventCount: 0, duplicateCount: 0, skipped: true }
  }
  const config = publisherConfig()
  let duplicateCount = 0
  for (const [index, batch] of chunks(events, config.batchSize).entries()) {
    duplicateCount += await publishBatch(config, {
      source: SOURCE, source_run_id: `admin-delete:${input.jobKey}`, source_batch_id: `batch-${index}`,
      observed_at: input.observedAt, mutations: batch,
    }, fetchImpl)
  }
  return { eventCount: events.length, duplicateCount, skipped: false }
}

export function canonicalAdminDeleteErrorCode(error: unknown): string {
  if (error instanceof CanonicalAdminDeleteShadowError) return error.code
  return error instanceof Error ? error.name : 'unknown_error'
}
