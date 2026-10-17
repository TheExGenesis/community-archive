import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  type ArchiveClickHouseBatch,
  type ArchiveClickHouseGraphBatch,
  type ArchiveGraphPurgePlan,
  type ArchiveGraphPurgeRequest,
  type ArchivePolicyDecisions,
  ArchiveClickHouseSink,
  attemptArchiveClickHouseDelivery,
  attemptArchiveGraphPurge,
  buildArchiveClickHouseBatch,
  buildArchiveGraphBatch,
  buildArchiveTombstoneBatch,
  collectArchivePolicyCandidates,
  createArchiveClickHouseManifest,
  planArchiveGraphPurge,
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
  const queueFirst = processor.indexOf(
    'await publishCanonicalArchiveQueueFirst(',
  )
  const compatibilityWrite = processor.indexOf(
    'await processSingleArchive(',
    queueFirst,
  )
  const completion = processor.indexOf("SET upload_phase = 'completed'")
  const directSink = processor.indexOf(
    'await attemptClickHouseDelivery(',
    completion,
  )
  const canonicalShadow = processor.indexOf(
    'await attemptCanonicalArchiveShadow(',
    directSink,
  )
  assert.ok(
    queueFirst >= 0 && compatibilityWrite > queueFirst &&
      completion > compatibilityWrite && directSink > completion &&
      canonicalShadow > directSink,
  )
  assert.match(processor, /jsonb_array_elements\(\$\{trx\.json\(candidates as never\)\}::jsonb\)/)
  assert.doesNotMatch(processor, /JSON\.stringify\(candidates\)/)
})

test('preserves all four extended attachments in the ClickHouse and canonical archive batch', () => {
  const media = ['701', '702', '703', '704'].map((id_str) => ({
    id_str, media_url_https: `https://example.com/${id_str}.jpg`, type: 'photo',
    sizes: { large: { w: 1200, h: 800 } },
  }))
  const source = {
    ...archive,
    tweets: [{ tweet: {
      ...archive.tweets[0].tweet,
      entities: { urls: [], user_mentions: [], media: media.slice(0, 1) },
      extended_entities: { media },
    } }],
  }
  const batch = buildArchiveClickHouseBatch(source, createArchiveClickHouseManifest(source, '9'), new Map(), '2026-09-06T00:00:00Z')
  assert.deepEqual(batch.tweet_media_versions.map((row) => row.media_id), ['701', '702', '703', '704'])
})

const graphArchive = {
  ...archive,
  like: [
    { like: { tweetId: '500', fullText: 'liked third-party text SENTINEL' } },
    { like: { tweetId: '500', fullText: 'duplicate like' } },
    { like: { tweetId: 'not-a-number' } },
    { like: { tweetId: '501' } },
  ],
  follower: [
    { follower: { accountId: '600' } },
    { follower: { accountId: '-1' } },
  ],
  following: [
    { following: { accountId: '700' } },
    { following: { accountId: '600' } },
  ],
}

test('likes and follow edges keep per-upload provenance and never carry liked text', () => {
  const manifest = createArchiveClickHouseManifest(graphArchive, '9')
  const batch = buildArchiveGraphBatch(
    graphArchive,
    manifest,
    '2026-10-16T12:00:00.000Z',
  )

  assert.deepEqual(
    batch.account_likes.map((row) => [
      row.account_id,
      row.liked_tweet_id,
      row.archive_upload_id,
      row.is_tombstone,
    ]),
    [
      ['111', '500', '9', 0],
      ['111', '501', '9', 0],
    ],
  )
  assert.deepEqual(
    batch.liked_tweet_versions.map((row) => [
      row.tweet_id,
      row.author_account_id,
      row.full_text,
      row.is_tombstone,
    ]),
    [
      ['500', null, '', 1],
      ['501', null, '', 1],
    ],
  )
  assert.deepEqual(
    batch.account_follows.map((row) => [
      row.direction,
      row.related_account_id,
      row.archive_upload_id,
    ]),
    [
      ['follower', '600'],
      ['following', '700'],
      ['following', '600'],
    ].map(([direction, id]) => [direction, id, '9']),
  )
  assert.equal(new Set(batch.account_likes.map((row) => row.event_id)).size, 2)
  assert.equal(JSON.stringify(batch).includes('SENTINEL'), false)
})

test('likes and follows are written only for an eligible, unblocked upload', async () => {
  const manifest = createArchiveClickHouseManifest(graphArchive, '9')
  const delivery = {
    archive_upload_id: manifest.archiveUploadId,
    account_id: manifest.accountId,
    tweet_ids: manifest.tweetIds,
    username: 'allowed_owner',
  }
  const attempt = async (ownerBlocked: boolean, graphEligible: boolean) => {
    const graphWrites: ArchiveClickHouseGraphBatch[] = []
    const result = await attemptArchiveClickHouseDelivery({
      delivery,
      archive: graphArchive,
      withOwnerPolicyLock: async (_accountId, operation) =>
        operation({
          ownerBlocked,
          graphEligible,
          resolvePolicies: async () => new Map(),
          markDelivered: async () => undefined,
        }),
      sink: {
        writeBatch: async () => undefined,
        writeGraphBatch: async (batch) => {
          graphWrites.push(batch)
        },
      },
      markPending: async () => assert.fail('must not remain pending'),
    })
    assert.deepEqual(result, { status: 'delivered' })
    return graphWrites
  }

  assert.equal((await attempt(false, true))[0]?.account_likes.length, 2)
  // A deleted upload (or a disabled feature flag) must not be re-written.
  assert.equal((await attempt(false, false)).length, 0)
  // An opted-out owner contributes no edges, whatever the flag says.
  assert.equal((await attempt(true, true)).length, 0)
})

test('a failed likes/follows write leaves the whole delivery pending', async () => {
  const manifest = createArchiveClickHouseManifest(graphArchive, '9')
  let delivered = false
  let pendingCode = ''
  const result = await attemptArchiveClickHouseDelivery({
    delivery: {
      archive_upload_id: manifest.archiveUploadId,
      account_id: manifest.accountId,
      tweet_ids: manifest.tweetIds,
      username: 'allowed_owner',
    },
    archive: graphArchive,
    withOwnerPolicyLock: async (_accountId, operation) =>
      operation({
        ownerBlocked: false,
        graphEligible: true,
        resolvePolicies: async () => new Map(),
        markDelivered: async () => {
          delivered = true
        },
      }),
    sink: {
      writeBatch: async () => undefined,
      writeGraphBatch: async () => {
        throw new Error('raw ClickHouse response with SENTINEL')
      },
    },
    markPending: async (code) => {
      pendingCode = code
    },
  })
  assert.equal(result.status, 'pending')
  assert.equal(delivered, false)
  assert.equal(pendingCode, 'archive_clickhouse_delivery_failed')
})

test('purge plans match each PostgreSQL deletion path', () => {
  const request = (
    reason: ArchiveGraphPurgeRequest['reason'],
    archiveUploadId: string | null = null,
  ): ArchiveGraphPurgeRequest => ({
    id: '42',
    purge_scope: archiveUploadId ? 'archive_upload' : 'account',
    account_id: '111',
    archive_upload_id: archiveUploadId,
    reason,
  })
  const state = (existingUploadIds: string[], ownerBlocked = false) => ({
    existingUploadIds,
    ownerBlocked,
    maxUploadId: '20',
  })

  assert.deepEqual(planArchiveGraphPurge(request('delete_single_archive', '9'), state(['9', '10'])), {
    accountId: '111',
    archiveUploadId: '9',
    keepUploadIds: [],
    maxUploadId: '20',
    purgeLikedTweetAuthor: false,
    requestId: '42',
  })
  // A re-upload created after "delete all my archives" survives the purge.
  assert.deepEqual(planArchiveGraphPurge(request('delete_user_archive'), state(['12'])).keepUploadIds, ['12'])
  // An opt-out keeps nothing and also tombstones liked text the account wrote.
  const optOut = planArchiveGraphPurge(request('policy_tombstone'), state(['12'], true))
  assert.deepEqual(optOut.keepUploadIds, [])
  assert.equal(optOut.purgeLikedTweetAuthor, true)
  // Replayed after the account opted back in and re-uploaded: keep the new upload.
  assert.deepEqual(planArchiveGraphPurge(request('policy_tombstone'), state(['12'])).keepUploadIds, ['12'])
  assert.throws(
    () => planArchiveGraphPurge({ ...request('policy_tombstone'), account_id: 'policy_unknown:1' }, state([])),
    /invalid_graph_purge_request/,
  )
  assert.throws(
    () => planArchiveGraphPurge(request('delete_single_archive'), state([])),
    /invalid_graph_purge_request/,
  )
})

test('a purge completes its duplicates and runs no ClickHouse work under the lock', async () => {
  const request: ArchiveGraphPurgeRequest = {
    id: '42',
    purge_scope: 'account',
    account_id: '111',
    archive_upload_id: null,
    reason: 'delete_user_archive',
  }
  const events: string[] = []
  let plan: ArchiveGraphPurgePlan | undefined
  let completedIds: string[] = []
  const ok = await attemptArchiveGraphPurge({
    request,
    readStateUnderPolicyLock: async () => {
      events.push('state')
      return {
        requestPending: true,
        existingUploadIds: ['12'],
        ownerBlocked: false,
        maxUploadId: '12',
        coveredRequestIds: ['43', '44'],
      }
    },
    sink: {
      purgeGraph: async (value) => {
        events.push('purge')
        plan = value
      },
    },
    markCompleted: async (ids) => {
      events.push('complete')
      completedIds = ids
    },
    markPending: async () => assert.fail('must not remain pending'),
  })
  assert.deepEqual(ok, { status: 'completed' })
  assert.deepEqual(events, ['state', 'purge', 'complete'])
  assert.deepEqual(plan?.keepUploadIds, ['12'])
  assert.equal(plan?.maxUploadId, '12')
  assert.deepEqual(completedIds, ['42', '43', '44'])

  // Already completed by an earlier duplicate: nothing to do.
  const skipped = await attemptArchiveGraphPurge({
    request,
    readStateUnderPolicyLock: async () => ({
      requestPending: false,
      existingUploadIds: [],
      ownerBlocked: false,
      maxUploadId: '12',
      coveredRequestIds: [],
    }),
    sink: { purgeGraph: async () => assert.fail('must not purge') },
    markCompleted: async () => assert.fail('must not complete again'),
    markPending: async () => assert.fail('must not remain pending'),
  })
  assert.deepEqual(skipped, { status: 'completed' })

  let pendingCode = ''
  const failed = await attemptArchiveGraphPurge({
    request,
    readStateUnderPolicyLock: async () => ({
      requestPending: true,
      existingUploadIds: [],
      ownerBlocked: false,
      maxUploadId: '12',
      coveredRequestIds: ['43'],
    }),
    sink: {
      purgeGraph: async () => {
        throw new Error('ClickHouse said SENTINEL')
      },
    },
    markCompleted: async () => assert.fail('must not complete'),
    markPending: async (code) => {
      pendingCode = code
    },
  })
  assert.equal(failed.status, 'pending')
  assert.equal(pendingCode, 'archive_clickhouse_graph_purge_failed')
})

// Opt-in: CLICKHOUSE_TEST_URL=http://127.0.0.1:8123 CLICKHOUSE_TEST_USER=...
// CLICKHOUSE_TEST_PASSWORD=... against a scratch server with
// ops/clickhouse-likes-follows/schema.sql applied. Never point it at production.
const integrationUrl = process.env.CLICKHOUSE_TEST_URL
test(
  'ClickHouse purge removes exactly the targeted likes and follows',
  { skip: !integrationUrl && 'CLICKHOUSE_TEST_URL is not set' },
  async () => {
    const sink = new ArchiveClickHouseSink(
      integrationUrl!,
      process.env.CLICKHOUSE_TEST_DATABASE || 'community_archive',
      process.env.CLICKHOUSE_TEST_USER || 'default',
      process.env.CLICKHOUSE_TEST_PASSWORD || '',
    )
    await sink.graphHealthCheck()
    const owner = '98765432100000001'
    const ownerArchive = (upload: string, likes: string[], follows: string[]) => ({
      ...graphArchive,
      account: [{ account: { ...archive.account[0].account, accountId: owner } }],
      like: likes.map((tweetId) => ({ like: { tweetId } })),
      follower: follows.map((accountId) => ({ follower: { accountId } })),
      following: [],
      upload,
    })
    const write = async (upload: string, likes: string[], follows: string[]) => {
      const source = ownerArchive(upload, likes, follows)
      await sink.writeGraphBatch(
        buildArchiveGraphBatch(source, createArchiveClickHouseManifest(source, upload)),
      )
    }
    const execute = async (sql: string) => {
      const response = await fetch(integrationUrl!, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.CLICKHOUSE_TEST_USER || 'default'}:${process.env.CLICKHOUSE_TEST_PASSWORD || ''}`).toString('base64')}`,
        },
        body: sql,
      })
      assert.equal(response.ok, true, await response.clone().text())
      return (await response.text()).trim()
    }
    const rows = (sql: string) => execute(`${sql} FORMAT TSV`)
    const liveLikes = () => rows(`
      SELECT arrayStringConcat(arraySort(groupUniqArray(toString(liked_tweet_id))), ',')
      FROM community_archive.account_likes FINAL
      WHERE account_id = ${owner} AND is_tombstone = 0`)

    // Start clean even after an interrupted earlier run.
    for (const table of ['account_likes', 'account_follows']) {
      await execute(`ALTER TABLE community_archive.${table} DELETE WHERE account_id = ${owner} SETTINGS mutations_sync = 2`)
    }
    await execute(`ALTER TABLE community_archive.liked_tweet_versions DELETE WHERE tweet_id = 77 SETTINGS mutations_sync = 2`)

    // Upload 9001 and 9002 overlap on tweet 2.
    await write('9001', ['1', '2'], ['11'])
    await write('9002', ['2', '3'], ['12'])
    await execute(`INSERT INTO community_archive.liked_tweet_versions
      (tweet_id, author_account_id, full_text, is_tombstone, source, event_id, observed_at)
      VALUES (77, ${owner}, 'attributed liked text', 0, 'supabase_graph_backfill', 'pg:liked_tweets:77', now64(3) - 60)`)
    assert.equal(await liveLikes(), '1,2,3')

    // Deleting one upload keeps edges another retained upload contributes.
    await sink.purgeGraph({ accountId: owner, archiveUploadId: '9001', keepUploadIds: [], maxUploadId: '9002', purgeLikedTweetAuthor: false, requestId: '1' })
    assert.equal(await liveLikes(), '2,3')

    // "Delete all" keeps an upload created after the deletion, and one
    // delivered while the purge runs (above the upload-ID bound).
    await write('9003', ['4'], [])
    await write('9004', ['5'], [])
    await sink.purgeGraph({ accountId: owner, archiveUploadId: null, keepUploadIds: ['9003'], maxUploadId: '9003', purgeLikedTweetAuthor: false, requestId: '2' })
    assert.equal(await liveLikes(), '4,5')

    // An opt-out removes every row and the liked text the account authored.
    await sink.purgeGraph({ accountId: owner, archiveUploadId: null, keepUploadIds: [], maxUploadId: '9004', purgeLikedTweetAuthor: true, requestId: '3' })
    assert.equal(await rows(`SELECT count() FROM community_archive.account_likes WHERE account_id = ${owner}`), '0')
    assert.equal(await rows(`SELECT count() FROM community_archive.account_follows WHERE account_id = ${owner}`), '0')
    assert.equal(await rows(`
      SELECT concat(toString(argMax(is_tombstone, observed_at)), ':', argMax(full_text, observed_at))
      FROM community_archive.liked_tweet_versions WHERE tweet_id = 77`), '1:')
    assert.equal(await rows(`SELECT count() FROM community_archive.liked_tweet_versions WHERE tweet_id = 77 AND full_text != ''`), '0')

    // Purges are idempotent once nothing remains.
    await sink.purgeGraph({ accountId: owner, archiveUploadId: null, keepUploadIds: [], maxUploadId: '9004', purgeLikedTweetAuthor: true, requestId: '3' })
  },
)
