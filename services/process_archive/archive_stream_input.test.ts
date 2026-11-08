import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  buildArchiveClickHouseBatch,
  buildArchiveClickHouseBatches,
  buildArchiveGraphBatch,
  buildArchiveGraphBatches,
  collectArchivePolicyCandidates,
  createArchiveClickHouseManifest,
  type ArchivePolicyDecisions,
} from './archive_clickhouse'
import { buildCanonicalArchiveMutations } from './canonical_archive'
import { readArchiveStream } from './archive_stream_input'
import { realisticArchive } from './archive_test_fixture'

const encoder = new TextEncoder()

async function* chunked(bytes: Uint8Array, size: number) {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size)
}

const read = (text: string | Uint8Array, size = 65536, reference?: any) =>
  readArchiveStream(
    chunked(typeof text === 'string' ? encoder.encode(text) : text, size),
    reference,
  ).then((result) => result.archive)

test('parses every section across arbitrary chunk boundaries', async () => {
  const tricky = {
    account: [{ account: { accountId: '1', username: 'a"b\\c{d}[e],f' } }],
    'odd key "quoted"': { nested: [1, [2, 3], { x: '}' }] },
    empty: [],
    number: 42,
    flag: false,
    nothing: null,
    text: 'é ✨ 🎉   "q" \\',
    community: [
      { tweet: { id_str: '9', full_text: ', ] }' } },
      'primitive',
      7,
      null,
    ],
  }
  const text = ` \n${JSON.stringify(tricky, null, 2)}\n `
  for (const size of [1, 2, 3, 5, 7, 64, 65536]) {
    assert.deepEqual(await read(text, size), tricky, `chunk size ${size}`)
  }
})

test('the checksum matches hashing Blob.text(), including a leading BOM', async () => {
  const body = JSON.stringify(realisticArchive(3, 2))
  for (const bytes of [
    encoder.encode(body),
    new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode(body)]),
  ]) {
    const expected = createHash('sha256')
      .update(await new Blob([bytes]).text(), 'utf8')
      .digest('hex')
    await read(bytes, 4, { storage_sha256: expected, account_id: '13232322' })
    await assert.rejects(
      read(bytes, 4, { storage_sha256: 'f'.repeat(64) }),
      /checksum mismatch/,
    )
  }
})

test('modified bytes report a checksum mismatch even when the JSON breaks', async () => {
  const body = JSON.stringify(realisticArchive(3, 2))
  const reference = {
    storage_sha256: createHash('sha256').update(body).digest('hex'),
  }
  await assert.rejects(
    read(body.slice(0, -5), 3, reference),
    /checksum mismatch/,
  )
  await assert.rejects(read(body.slice(0, -5), 3), /ended early|JSON/)
})

test('a cross-owner archive is rejected', async () => {
  await assert.rejects(
    read(JSON.stringify(realisticArchive(2, 1)), 1024, { account_id: '999' }),
    /does not match the upload record/,
  )
})

test('rejects input that is not one archive object', async () => {
  await assert.rejects(read('[1,2]'), /must be a JSON object/)
  await assert.rejects(read('{"a": [1]} {"b": 2}'), /after the archive object/)
})

test('projection drops unread fields but changes no downstream output', async () => {
  const raw = realisticArchive(60, 30)
  const projected = await read(JSON.stringify(raw), 997)

  // Unread fields are gone.
  assert.equal(projected.tweets[0].tweet.source, undefined)
  assert.equal(projected.tweets[0].tweet.edit_info, undefined)
  assert.equal(projected.like[0].like.fullText, undefined)
  assert.equal(projected.follower[0].follower.userLink, undefined)
  assert.deepEqual(projected.account, raw.account)
  assert.deepEqual(projected['community-tweet'], raw['community-tweet'])

  const uploadId = '700'
  const rawManifest = createArchiveClickHouseManifest(raw, uploadId)
  assert.deepEqual(
    createArchiveClickHouseManifest(projected, uploadId),
    rawManifest,
  )
  assert.deepEqual(
    collectArchivePolicyCandidates(projected),
    collectArchivePolicyCandidates(raw),
  )
  // Block every candidate so blocked-target paths are exercised too.
  for (const blocked of [false, true]) {
    const decisions: ArchivePolicyDecisions = new Map(
      collectArchivePolicyCandidates(raw).map((candidate) => [
        candidate.key,
        { accountId: candidate.accountId ?? '222', blocked },
      ]),
    )
    const observedAt = '2026-11-08T00:00:00.000Z'
    const rawBatch = buildArchiveClickHouseBatch(
      raw,
      rawManifest,
      decisions,
      observedAt,
    )
    const projectedBatch = buildArchiveClickHouseBatch(
      projected,
      rawManifest,
      decisions,
      observedAt,
    )
    assert.deepEqual(projectedBatch, rawBatch)
    assert.ok(rawBatch.tweet_media_versions.length > 0)
    assert.deepEqual(
      buildCanonicalArchiveMutations(projectedBatch),
      buildCanonicalArchiveMutations(rawBatch),
    )
  }
  assert.deepEqual(
    buildArchiveGraphBatch(projected, rawManifest, 'x'),
    buildArchiveGraphBatch(raw, rawManifest, 'x'),
  )
})

// Rows from bounded batches, deduplicated by event_id the way one whole batch
// is, must equal the whole batch.
function mergeBatches<T extends object>(
  batches: Iterable<T>,
): Record<string, Map<string, unknown>> {
  const merged: Record<string, Map<string, unknown>> = {}
  for (const batch of batches) {
    for (const [table, rows] of Object.entries(batch)) {
      merged[table] ??= new Map()
      for (const row of rows as Record<string, unknown>[])
        merged[table].set(String(row.event_id), row)
    }
  }
  return merged
}

test('bounded batches carry exactly the rows of one whole-archive batch', () => {
  const raw = realisticArchive(53, 41)
  // Repeat a tweet across slices so cross-batch duplicates are exercised.
  raw.tweets.push(raw.tweets[0])
  const manifest = createArchiveClickHouseManifest(raw, '700')
  const decisions: ArchivePolicyDecisions = new Map(
    collectArchivePolicyCandidates(raw).map((candidate, i) => [
      candidate.key,
      { accountId: candidate.accountId ?? '222', blocked: i % 2 === 0 },
    ]),
  )
  const observedAt = '2026-11-08T00:00:00.000Z'
  const whole = buildArchiveClickHouseBatch(
    raw,
    manifest,
    decisions,
    observedAt,
  )
  const sliced = [
    ...buildArchiveClickHouseBatches(raw, manifest, decisions, observedAt, 7),
  ]
  assert.equal(sliced.length, 8)
  const ownerRows = (batch: {
    account_observations: Record<string, unknown>[]
  }) =>
    batch.account_observations.filter(
      (row) => row.account_id === manifest.accountId && row.is_tombstone === 0,
    )
  assert.equal(sliced.filter((batch) => ownerRows(batch).length).length, 1)
  assert.deepEqual(mergeBatches(sliced), mergeBatches([whole]))

  const canonicalWhole = new Map(
    buildCanonicalArchiveMutations(whole).map((event) => [
      `${event.entity_type}\0${event.entity_key}`,
      event,
    ]),
  )
  const canonicalSliced = new Map(
    sliced
      .flatMap(buildCanonicalArchiveMutations)
      .map((event) => [`${event.entity_type}\0${event.entity_key}`, event]),
  )
  assert.deepEqual(canonicalSliced, canonicalWhole)

  const graphWhole = buildArchiveGraphBatch(raw, manifest, observedAt)
  const graphSliced = [
    ...buildArchiveGraphBatches(raw, manifest, observedAt, 10),
  ]
  assert.equal(graphSliced.length, 6)
  assert.deepEqual(mergeBatches(graphSliced), mergeBatches([graphWhole]))

  // An archive without tweets still yields its account observation.
  const empty = { ...raw, tweets: [] }
  const emptyManifest = createArchiveClickHouseManifest(empty, '700')
  const [only, ...rest] = buildArchiveClickHouseBatches(
    empty,
    emptyManifest,
    new Map(),
    observedAt,
  )
  assert.equal(
    only.account_observations.filter(
      (row) => row.account_id === emptyManifest.accountId,
    ).length,
    1,
  )
  assert.equal(rest.length, 0)
})
