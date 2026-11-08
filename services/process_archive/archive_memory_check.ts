// Large-archive memory check. Writes a synthetic archive with the shape of
// the largest production upload (default: 310k tweets, 607k likes, 63k
// followers, 13k following), then runs every in-memory stage the worker runs
// for one upload and reports the peak heap. No database or network is used.
//
//   node --expose-gc --max-old-space-size=1024 --import tsx archive_memory_check.ts [dir]
//
// Env: MEMCHECK_TWEETS, MEMCHECK_LIKES, MEMCHECK_FOLLOWERS, MEMCHECK_FOLLOWING.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildArchiveClickHouseBatches,
  buildArchiveGraphBatches,
  collectArchivePolicyCandidates,
  createArchiveClickHouseManifest,
  type ArchivePolicyDecisions,
} from './archive_clickhouse'
import { buildCanonicalArchiveMutations } from './canonical_archive'
import { readArchiveStream } from './archive_stream_input'
import { patchArchive } from './process_archive_upload'
import {
  realisticArchiveHead,
  realisticLike,
  realisticTweet,
} from './archive_test_fixture'

const count = (name: string, fallback: number) =>
  Number(process.env[name] ?? fallback)
const TWEETS = count('MEMCHECK_TWEETS', 310_000)
const LIKES = count('MEMCHECK_LIKES', 607_000)
const FOLLOWERS = count('MEMCHECK_FOLLOWERS', 63_500)
const FOLLOWING = count('MEMCHECK_FOLLOWING', 12_900)

// The JSONEachRow request body the ClickHouse sink sends.
const serialize = (rows: readonly unknown[]) =>
  rows.map((row) => JSON.stringify(row)).join('\n')
const mb = (bytes: number) => Math.round(bytes / 1048576)
let peakHeap = 0
let peakRss = 0
const sample = () => {
  const usage = process.memoryUsage()
  peakHeap = Math.max(peakHeap, usage.heapUsed)
  peakRss = Math.max(peakRss, usage.rss)
}
const sampler = setInterval(sample, 20)
const stage = (name: string) => {
  sample()
  console.log(
    `${name.padEnd(34)} heap ${mb(process.memoryUsage().heapUsed)} MB (peak ${mb(peakHeap)} MB, rss peak ${mb(peakRss)} MB)`,
  )
}

async function writeArchive(file: string) {
  const out = fs.createWriteStream(file)
  const write = (text: string) =>
    out.write(text)
      ? Promise.resolve()
      : new Promise((r) => out.once('drain', r))
  const head = realisticArchiveHead()
  await write('{\n')
  for (const [key, value] of Object.entries(head)) {
    await write(`${JSON.stringify(key)}: ${JSON.stringify(value)},\n`)
  }
  const section = async (
    key: string,
    n: number,
    make: (i: number) => unknown,
    last = false,
  ) => {
    await write(`${JSON.stringify(key)}: [`)
    for (let i = 0; i < n; i++)
      await write(`${i ? ',' : ''}\n${JSON.stringify(make(i))}`)
    await write(`]${last ? '' : ','}\n`)
  }
  await section('tweets', TWEETS, realisticTweet)
  await section('follower', FOLLOWERS, (i) => ({
    follower: {
      accountId: String(10_000_000 + i),
      userLink: `https://twitter.com/intent/user?user_id=${10_000_000 + i}`,
    },
  }))
  await section('following', FOLLOWING, (i) => ({
    following: {
      accountId: String(20_000_000 + i),
      userLink: `https://twitter.com/intent/user?user_id=${20_000_000 + i}`,
    },
  }))
  await section('note-tweet', 0, () => null)
  await section('like', LIKES, realisticLike, true)
  await write('}\n')
  await new Promise<void>((resolve) => out.end(resolve))
}

async function main() {
  const dir =
    process.argv[2] ??
    fs.mkdtempSync(path.join(os.tmpdir(), 'archive-memcheck-'))
  const file = path.join(dir, 'archive.json')
  if (!fs.existsSync(file)) await writeArchive(file)
  console.log(
    `archive ${mb(fs.statSync(file).size)} MB, heap limit ${mb(require('node:v8').getHeapStatistics().heap_size_limit)} MB`,
  )
  global.gc?.()
  peakHeap = 0
  stage('start')

  const { archive } = await readArchiveStream(fs.createReadStream(file))
  global.gc?.()
  stage('streamed and projected')

  const uploadId = '700'
  const manifest = createArchiveClickHouseManifest(archive, uploadId)
  stage('manifest')

  // Queue-first canonical publish: policy candidates, then each bounded
  // ClickHouse-shaped batch converted to canonical mutations and serialized.
  {
    const decisions: ArchivePolicyDecisions = new Map(
      collectArchivePolicyCandidates(archive).map((candidate) => [
        candidate.key,
        { accountId: candidate.accountId, blocked: false },
      ]),
    )
    stage(`canonical: ${decisions.size} policy decisions`)
    let events = 0
    for (const batch of buildArchiveClickHouseBatches(
      archive,
      manifest,
      decisions,
    )) {
      const mutations = buildCanonicalArchiveMutations(batch)
      events += mutations.length
      for (let i = 0; i < mutations.length; i += 100)
        JSON.stringify(mutations.slice(i, i + 100))
      sample()
    }
    stage(`canonical: ${events} mutations published`)
  }
  global.gc?.()

  // PostgreSQL compatibility inserts (processSingleArchive): patch, then the
  // likes/follows rows, which the processor builds whole.
  patchArchive(archive)
  stage('postgres: patched archive')
  {
    const accountId = archive.account[0].account.accountId
    const likedTweets = archive.like.map((like: any) => ({
      tweet_id: like.like.tweetId,
      full_text: '',
      author_account_id: null,
      is_tombstone: true,
    }))
    const likes = archive.like.map((like: any) => ({
      account_id: accountId,
      liked_tweet_id: like.like.tweetId,
      archive_upload_id: 700,
    }))
    const followers = archive.follower.map((f: any) => ({
      account_id: accountId,
      follower_account_id: f.follower.accountId,
      archive_upload_id: 700,
    }))
    stage(
      `postgres: ${likedTweets.length + likes.length + followers.length} graph rows`,
    )
  }
  global.gc?.()

  // Post-commit ClickHouse delivery: each content batch and graph batch is
  // serialized as its JSONEachRow request body, one at a time.
  {
    let rows = 0
    for (const batch of buildArchiveClickHouseBatches(
      archive,
      manifest,
      new Map(),
    )) {
      for (const tableRows of Object.values(batch)) {
        rows += tableRows.length
        void serialize(tableRows)
      }
      sample()
    }
    for (const graph of buildArchiveGraphBatches(archive, manifest)) {
      for (const tableRows of Object.values(graph)) {
        rows += tableRows.length
        for (let i = 0; i < tableRows.length; i += 25_000)
          void serialize(tableRows.slice(i, i + 25_000))
      }
      sample()
    }
    stage(`clickhouse: ${rows} rows written`)
  }

  clearInterval(sampler)
  console.log(`PEAK heap ${mb(peakHeap)} MB, rss ${mb(peakRss)} MB`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
