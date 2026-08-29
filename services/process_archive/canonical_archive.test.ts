import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { ArchiveClickHouseBatch } from './archive_clickhouse'
import {
  buildCanonicalArchiveEvents,
  canonicalArchivePolicyVersion,
  ensureCanonicalArchivePendingReport,
  pendingCanonicalArchiveReportIds,
  publishCanonicalArchiveBatch,
} from './canonical_archive'

const manifest = {
  archiveUploadId: '9',
  accountId: '6001',
  tweetIds: ['5001'],
}

function emptyBatch(): ArchiveClickHouseBatch {
  return {
    account_observations: [],
    tweet_content_versions: [],
    tweet_engagement_observations: [],
    tweet_analytics_versions: [],
    tweet_archive_provenance: [],
    tweet_mentions: [],
    tweet_relationships: [],
    tweet_media_versions: [],
    tweet_url_versions: [],
  }
}

function fixtureBatch(tombstone = false): ArchiveClickHouseBatch {
  const batch = emptyBatch()
  const observedAt = '2026-08-29T03:00:00.000Z'
  batch.account_observations.push({
    account_id: '6001',
    username: tombstone ? '' : 'alice',
    account_display_name: tombstone ? '' : 'Alice',
    is_tombstone: tombstone ? 1 : 0,
    source: 'archive_upload',
    event_id: 'account:6001',
    observed_at: observedAt,
  })
  batch.tweet_content_versions.push({
    tweet_id: '5001',
    account_id: '6001',
    full_text: tombstone ? '' : 'allowed content',
    is_tombstone: tombstone ? 1 : 0,
    source: 'archive_upload',
    event_id: 'tweet:5001',
    observed_at: observedAt,
  })
  if (!tombstone) {
    batch.tweet_engagement_observations.push({
      tweet_id: '5001',
      favorite_count: 2,
      retweet_count: 1,
      source: 'archive_upload',
      event_id: 'engagement:5001',
      observed_at: observedAt,
    })
  }
  batch.tweet_archive_provenance.push({
    tweet_id: '5001',
    archive_upload_id: '9',
    source: 'archive_upload',
    event_id: 'provenance:5001',
    observed_at: observedAt,
  })
  // The denormalized serving projection is deliberately not canonical input.
  batch.tweet_analytics_versions.push({
    tweet_id: '5001',
    account_id: '6001',
    full_text: 'projection copy',
    source: 'archive_upload',
    event_id: 'analytics:5001',
    observed_at: observedAt,
  })
  return batch
}

function withPublisherEnvironment(
  operation: () => Promise<void>,
): Promise<void> {
  const names = [
    'CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED',
    'CANONICAL_PUBLISH_URL',
    'CANONICAL_PUBLISHER_API_KEY',
    'CANONICAL_PUBLISH_BATCH_SIZE',
  ] as const
  const original = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  )
  process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED = 'true'
  process.env.CANONICAL_PUBLISH_URL =
    'http://127.0.0.1:3000/internal/canonical-ingest'
  process.env.CANONICAL_PUBLISHER_API_KEY = 'publisher-secret'
  process.env.CANONICAL_PUBLISH_BATCH_SIZE = '2'
  return operation().finally(() => {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name]
      else process.env[name] = original[name]
    }
  })
}

test('archive event hashes match the firehose TypeScript contract fixture', () => {
  const batch = emptyBatch()
  batch.tweet_content_versions.push({
    tweet_id: '5001',
    account_id: '6001',
    full_text: 'allowed content',
    is_tombstone: 0,
    source: 'archive_upload',
    event_id: 'tweet:5001',
    observed_at: '2026-08-29T03:00:00.000Z',
  })
  const [event] = buildCanonicalArchiveEvents(
    batch,
    manifest,
    'policy-1',
    '2026-08-29T03:10:00.000Z',
  )

  assert.equal(
    event.payload_hash,
    '21ca72ebb9cb0cc8133efb5a6618b75ae5a33d3c45bc131c34e27eabee8aab81',
  )
  assert.equal(
    event.event_id,
    '8d2454d7aff296ad3054b42955ace67dd7d1506e8c3df1b262994356ccb34170',
  )
})

test('maps policy-safe sink rows and omits the serving projection', () => {
  const events = buildCanonicalArchiveEvents(
    fixtureBatch(),
    manifest,
    'policy-1',
  )
  const byType = new Map(events.map((event) => [event.entity_type, event]))

  assert.equal(byType.get('tweet_engagement')?.payload.account_id, '6001')
  assert.equal(byType.get('relationship')?.payload.account_id, '6001')
  assert.equal(
    events.some((event) => String(event.entity_type) === 'tweet_analytics'),
    false,
  )
  assert.equal(JSON.stringify(events).includes('projection copy'), false)
})

test('converts content-free policy rows to canonical tombstones', () => {
  const events = buildCanonicalArchiveEvents(
    fixtureBatch(true),
    manifest,
    'policy-1',
  )
  const account = events.find((event) => event.entity_type === 'account')
  const tweet = events.find((event) => event.entity_type === 'tweet_content')
  const provenance = events.find(
    (event) => event.payload.archive_upload_id === '9',
  )

  assert.equal(account?.operation, 'tombstone')
  assert.equal(account?.payload.is_tombstone, true)
  assert.equal(tweet?.operation, 'tombstone')
  assert.equal(tweet?.payload.full_text, '')
  assert.equal(provenance?.operation, 'tombstone')
  assert.equal(provenance?.payload.is_tombstone, true)
})

test('policy version changes only when a relevant decision changes', () => {
  const allowed = new Map([
    ['candidate', { accountId: '7001', blocked: false }],
  ])
  const blocked = new Map([['candidate', { accountId: '7001', blocked: true }]])
  assert.notEqual(
    canonicalArchivePolicyVersion(manifest, false, allowed),
    canonicalArchivePolicyVersion(manifest, false, blocked),
  )
})

test('publisher checkpoints batches and skips them on a retry', async () => {
  await withPublisherEnvironment(async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'canonical-archive-'),
    )
    const calls: string[][] = []
    const fetchImpl = (async (_input, init) => {
      const body = JSON.parse(String(init?.body))
      calls.push(
        body.events.map((event: { event_id: string }) => event.event_id),
      )
      return new Response(
        JSON.stringify({
          accepted: body.events.map(
            (event: { event_id: string }, index: number) => ({
              event_id: event.event_id,
              message_id: `1-${index}`,
              duplicate: false,
            }),
          ),
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await publishCanonicalArchiveBatch({
          batch: fixtureBatch(),
          manifest,
          policyVersion: 'policy-1',
          reportDir: directory,
          fetchImpl,
        })
      }
      const reportText = fs.readFileSync(
        path.join(directory, 'canonical_archive_9.json'),
        'utf8',
      )
      const report = JSON.parse(reportText)
      assert.equal(report.status, 'complete')
      assert.equal(calls.length, 2)
      assert.equal(calls.flat().length, 4)
      assert.equal(reportText.includes('publisher-secret'), false)
      assert.equal(reportText.includes('allowed content'), false)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})

test('publisher is inert without its explicit flag', async () => {
  const original = process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED
  delete process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-archive-'))
  try {
    const result = await publishCanonicalArchiveBatch({
      batch: fixtureBatch(),
      manifest,
      policyVersion: 'policy-1',
      reportDir: directory,
    })
    assert.deepEqual(result, { status: 'disabled' })
    assert.deepEqual(fs.readdirSync(directory), [])
  } finally {
    if (original === undefined) {
      delete process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED
    } else {
      process.env.CANONICAL_ARCHIVE_SHADOW_PUBLISH_ENABLED = original
    }
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('publisher records a safe retry state on HTTP failure', async () => {
  await withPublisherEnvironment(async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-archive-'))
    try {
      await assert.rejects(
        publishCanonicalArchiveBatch({
          batch: fixtureBatch(),
          manifest,
          policyVersion: 'policy-1',
          reportDir: directory,
          fetchImpl: (async () => new Response('private response body', {
            status: 503,
          })) as typeof fetch,
        }),
        /canonical_http_503/,
      )
      const reportText = fs.readFileSync(
        path.join(directory, 'canonical_archive_9.json'),
        'utf8',
      )
      const report = JSON.parse(reportText)
      assert.equal(report.status, 'failed')
      assert.equal(report.last_error_code, 'canonical_http_503')
      assert.equal(reportText.includes('private response body'), false)
      assert.deepEqual(pendingCanonicalArchiveReportIds(directory), ['9'])
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})

test('pending markers are content-free and discoverable after a failed attempt', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-archive-'))
  try {
    ensureCanonicalArchivePendingReport('9', directory)
    const report = fs.readFileSync(
      path.join(directory, 'canonical_archive_9.json'),
      'utf8',
    )
    assert.deepEqual(pendingCanonicalArchiveReportIds(directory), ['9'])
    assert.equal(report.includes('allowed content'), false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
