import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  type ArchiveClickHouseBatch,
  type ArchivePolicyDecisions,
  attemptArchiveClickHouseDelivery,
  buildArchiveClickHouseBatch,
  buildArchiveTombstoneBatch,
  collectArchivePolicyCandidates,
  createArchiveClickHouseManifest,
} from './archive_clickhouse'

const archive = {
  account: [
    {
      account: {
        accountId: '111',
        username: 'allowed_owner',
        accountDisplayName: 'Allowed Owner',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
    },
  ],
  profile: [
    {
      profile: {
        description: {
          bio: 'owner bio',
          website: 'https://owner.example',
          location: 'somewhere',
        },
        avatarMediaUrl: 'https://owner.example/avatar.jpg',
        headerMediaUrl: 'https://owner.example/header.jpg',
      },
    },
  ],
  tweets: [
    {
      tweet: {
        id_str: '100',
        created_at: '2024-01-01T00:00:00.000Z',
        full_text: 'allowed quote commentary https://t.co/q',
        favorite_count: 2,
        retweet_count: 1,
        entities: {
          urls: [
            {
              url: 'https://t.co/q',
              expanded_url: 'https://x.com/blocked_user/status/900',
              display_url: 'x.com/blocked/status/900',
            },
          ],
          user_mentions: [],
          media: [],
        },
      },
    },
    {
      tweet: {
        id_str: '101',
        created_at: '2024-01-02T00:00:00.000Z',
        full_text: 'RT @blocked_user: forbidden target text SENTINEL',
        favorite_count: 4,
        retweet_count: 3,
        retweeted_status_id_str: '901',
        entities: { urls: [], user_mentions: [], media: [] },
      },
    },
    {
      tweet: {
        id_str: '102',
        created_at: '2024-01-03T00:00:00.000Z',
        full_text: 'ordinary allowed tweet',
        favorite_count: 6,
        retweet_count: 5,
        in_reply_to_status_id_str: '902',
        in_reply_to_user_id_str: '333',
        in_reply_to_screen_name: 'blocked_reply',
        entities: {
          urls: [],
          user_mentions: [
            { id_str: '444', screen_name: 'blocked_mention', name: 'Blocked' },
          ],
          media: [],
        },
      },
    },
  ],
  like: [],
  following: [],
  follower: [],
}

function blockedDecisions(): ArchivePolicyDecisions {
  return new Map(
    collectArchivePolicyCandidates(archive).map((candidate) => [
      candidate.key,
      {
        accountId:
          candidate.accountId ??
          (candidate.tweetId === '900' || candidate.tweetId === '901'
            ? '222'
            : null),
        blocked: true,
      },
    ]),
  )
}

test('allowed outers retain stable quote/retweet/reply edges while blocked targets are tombstones', () => {
  const manifest = createArchiveClickHouseManifest(archive, '9')
  const batch = buildArchiveClickHouseBatch(
    archive,
    manifest,
    blockedDecisions(),
    '2026-08-16T12:00:00.000Z',
  )

  const quote = batch.tweet_content_versions.find(
    (row) => row.tweet_id === '100',
  )
  const retweet = batch.tweet_content_versions.find(
    (row) => row.tweet_id === '101',
  )
  assert.equal(quote?.full_text, 'allowed quote commentary https://t.co/q')
  assert.equal(retweet?.full_text, '')
  assert.equal(retweet?.is_tombstone, 0)

  assert.deepEqual(
    batch.tweet_relationships.map((row) => [
      row.tweet_id,
      row.relationship_type,
      row.related_tweet_id,
    ]),
    [
      ['100', 'quote', '900'],
      ['101', 'retweet', '901'],
      ['102', 'reply', '902'],
    ],
  )
  assert.ok(
    batch.tweet_content_versions.some(
      (row) => row.tweet_id === '900' && row.is_tombstone === 1,
    ),
  )
  assert.ok(
    batch.account_observations.some(
      (row) => row.account_id === '222' && row.is_tombstone === 1,
    ),
  )
  assert.ok(
    batch.account_observations.some(
      (row) => row.account_id === '333' && row.is_tombstone === 1,
    ),
  )
  assert.ok(
    batch.account_observations.some(
      (row) => row.account_id === '444' && row.is_tombstone === 1,
    ),
  )
  assert.equal(
    batch.tweet_url_versions.some((row) =>
      String(row.expanded_url).includes('blocked_user'),
    ),
    false,
  )
  assert.equal(
    JSON.stringify(batch).includes('forbidden target text SENTINEL'),
    false,
  )
})

test('blocked-only archive delivery needs no raw source and writes stable-ID tombstones', async () => {
  let written: ArchiveClickHouseBatch | undefined
  let delivered = false
  let loaderCalled = false
  const result = await attemptArchiveClickHouseDelivery({
    delivery: {
      archive_upload_id: '9',
      account_id: '111',
      tweet_ids: ['100', '101', '102'],
      username: 'allowed_owner',
    },
    loadArchive: async () => {
      loaderCalled = true
      throw new Error('must not load')
    },
    withOwnerPolicyLock: async (_accountId, operation) =>
      operation({
        ownerBlocked: true,
        resolvePolicies: async () => new Map(),
        markDelivered: async () => {
          delivered = true
        },
      }),
    sink: {
      writeBatch: async (batch) => {
        written = batch
      },
    },
    markPending: async () => assert.fail('must not remain pending'),
    now: () => new Date('2026-08-16T12:00:00.000Z'),
  })

  assert.deepEqual(result, { status: 'delivered' })
  assert.equal(loaderCalled, false)
  assert.equal(delivered, true)
  assert.equal(written?.tweet_content_versions.length, 3)
  assert.equal(written?.tweet_engagement_observations.length, 0)
  assert.equal(written?.tweet_relationships.length, 0)
  assert.equal(JSON.stringify(written).includes('SENTINEL'), false)
})

test('allowed delivery reloads the original archive and never reconstructs content from PostgreSQL', async () => {
  let loaderCalled = false
  let delivered = false
  const manifest = createArchiveClickHouseManifest(archive, '9')
  const result = await attemptArchiveClickHouseDelivery({
    delivery: {
      archive_upload_id: manifest.archiveUploadId,
      account_id: manifest.accountId,
      tweet_ids: manifest.tweetIds,
      username: 'allowed_owner',
    },
    loadArchive: async () => {
      loaderCalled = true
      return archive
    },
    withOwnerPolicyLock: async (_accountId, operation) =>
      operation({
        ownerBlocked: false,
        resolvePolicies: async () => blockedDecisions(),
        markDelivered: async () => {
          delivered = true
        },
      }),
    sink: { writeBatch: async () => undefined },
    markPending: async () => assert.fail('must not remain pending'),
  })
  assert.deepEqual(result, { status: 'delivered' })
  assert.equal(loaderCalled, true)
  assert.equal(delivered, true)
})

test('ClickHouse outage cannot roll back PostgreSQL completion and leaves a content-free retry pending', async () => {
  const manifest = createArchiveClickHouseManifest(archive, '9')
  let delivered = false
  let pendingCode = ''
  const result = await attemptArchiveClickHouseDelivery({
    delivery: {
      archive_upload_id: manifest.archiveUploadId,
      account_id: manifest.accountId,
      tweet_ids: manifest.tweetIds,
      username: 'allowed_owner',
    },
    archive,
    withOwnerPolicyLock: async (_accountId, operation) =>
      operation({
        ownerBlocked: false,
        resolvePolicies: async () => new Map(),
        markDelivered: async () => {
          delivered = true
        },
      }),
    sink: {
      writeBatch: async () => {
        throw new Error('raw response with SENTINEL')
      },
    },
    markPending: async (code) => {
      pendingCode = code
    },
  })
  assert.deepEqual(result, {
    status: 'pending',
    errorCode: 'archive_clickhouse_delivery_failed',
  })
  assert.equal(delivered, false)
  assert.equal(pendingCode, 'archive_clickhouse_delivery_failed')
  assert.equal(pendingCode.includes('SENTINEL'), false)
})

test('allowed retry fails closed when the original archive is unavailable', async () => {
  let pendingCode = ''
  const result = await attemptArchiveClickHouseDelivery({
    delivery: {
      archive_upload_id: '9',
      account_id: '111',
      tweet_ids: ['100'],
      username: null,
    },
    withOwnerPolicyLock: async (_accountId, operation) =>
      operation({
        ownerBlocked: false,
        resolvePolicies: async () => new Map(),
        markDelivered: async () => assert.fail('must not deliver'),
      }),
    sink: { writeBatch: async () => assert.fail('must not write') },
    markPending: async (code) => {
      pendingCode = code
    },
  })
  assert.deepEqual(result, {
    status: 'pending',
    errorCode: 'archive_source_unavailable',
  })
  assert.equal(pendingCode, 'archive_source_unavailable')
})

test('delivery manifest is content-free and historical uploads are not seeded', () => {
  const manifest = createArchiveClickHouseManifest(archive, '9')
  assert.deepEqual(Object.keys(manifest).sort(), [
    'accountId',
    'archiveUploadId',
    'tweetIds',
  ])
  assert.equal(JSON.stringify(manifest).includes('SENTINEL'), false)
  assert.equal(
    JSON.stringify(buildArchiveTombstoneBatch(manifest)).includes('SENTINEL'),
    false,
  )

  const migration = fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../supabase/migrations/20260816200315_add_archive_clickhouse_delivery_state.sql',
    ),
    'utf8',
  )
  assert.equal(
    /INSERT\s+INTO\s+private\.archive_clickhouse_delivery/i.test(migration),
    false,
  )
  assert.equal(/FROM\s+public\.archive_upload/i.test(migration), false)
  assert.equal(
    /\b(full_text|username|profile|media|url)\b/i.test(migration),
    false,
  )

  const processor = fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      'process_archive_upload.ts',
    ),
    'utf8',
  )
  const completion = processor.indexOf("SET upload_phase = 'completed'")
  const directSink = processor.indexOf(
    'await attemptClickHouseDelivery(',
    completion,
  )
  assert.ok(completion >= 0 && directSink > completion)
  assert.match(processor, /jsonb_array_elements\(\$\{trx\.json\(candidates as never\)\}::jsonb\)/)
  assert.doesNotMatch(processor, /JSON\.stringify\(candidates\)/)
})
