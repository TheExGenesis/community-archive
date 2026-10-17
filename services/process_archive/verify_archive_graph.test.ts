import assert from 'node:assert/strict'
import test from 'node:test'
import {
  archiveEdges,
  compareAccountGraph,
  emptyEdges,
  resolveAccountArchivePaths,
  type EdgeSets,
} from './verify_archive_graph'

const edges = (likes: string[], followers: string[] = [], following: string[] = []): EdgeSets => ({
  likes: new Set(likes),
  followers: new Set(followers),
  following: new Set(following),
})

test('archive edges ignore malformed IDs and duplicate records', () => {
  const parsed = archiveEdges({
    like: [{ like: { tweetId: '1' } }, { like: { tweetId: '1' } }, { like: { tweetId: 'x' } }],
    follower: [{ follower: { accountId: '2' } }],
    following: [{ following: { accountId: '-3' } }],
  })
  assert.deepEqual([...parsed.likes], ['1'])
  assert.deepEqual([...parsed.followers], ['2'])
  assert.equal(parsed.following.size, 0)
})

test('ClickHouse must equal the union of retained archives', () => {
  const archives = new Map([['9', edges(['1', '2'], ['5'])], ['10', edges(['2', '3'])]])
  const match = compareAccountGraph(archives, {
    edges: edges(['1', '2', '3'], ['5']),
    byUpload: new Map([['9', edges(['1'], ['5'])], ['10', edges(['2', '3'])]]),
  })
  assert.equal(match.status, 'match')

  const missing = compareAccountGraph(archives, {
    edges: edges(['1', '2'], ['5']),
    byUpload: new Map([['9', edges(['1', '2'], ['5'])]]),
  })
  // Expected after a pre-rollout PostgreSQL single-archive delete; reported apart.
  assert.equal(missing.status, 'missing_only')
  assert.deepEqual(missing.likes, { archive: 3, clickhouse: 2, missing: 1, extra: 0 })

  const extra = compareAccountGraph(archives, {
    edges: edges(['1', '2', '3', '4'], ['5']),
    byUpload: new Map([['9', edges(['1'], ['5'])], ['10', edges(['2', '3'])]]),
  })
  assert.equal(extra.status, 'mismatch')
})

test('a row attributed to an upload that lacks the edge is reported', () => {
  const report = compareAccountGraph(new Map([['9', edges(['1'])], ['10', edges(['2'])]]), {
    edges: edges(['1', '2']),
    byUpload: new Map([['9', edges(['1', '2'])]]),
  })
  assert.equal(report.status, 'mismatch')
  assert.deepEqual(report.misattributed_uploads, ['9'])
})

test('overwritten legacy archives only require ClickHouse to contain the stored file', () => {
  const report = compareAccountGraph(new Map([['10', edges(['2'])]]), {
    edges: edges(['1', '2']),
    byUpload: new Map([['9', edges(['1'])], ['10', edges(['2'])]]),
  }, new Set(['9']))
  assert.equal(report.status, 'match')
  assert.equal(emptyEdges().likes.size, 0)
})

test('verification reads each folder from the trusted owner and skips accounts with a mismatched row', () => {
  const pinned = {
    id: '7',
    account_id: '123',
    username: 'Owner',
    storage_path: 'owner/12345678-1234-1234-1234-123456789abc/archive.json',
    storage_sha256: 'a'.repeat(64),
  }
  const legacy = { id: '6', account_id: '123', username: 'owner' }
  const ok = resolveAccountArchivePaths([legacy, pinned], 'Owner')
  assert.equal(ok.status, 'ok')
  assert.deepEqual(
    ok.status === 'ok' ? [...ok.paths] : [],
    [['6', 'owner/archive.json'], ['7', pinned.storage_path]],
  )

  const forged = { id: '8', account_id: '123', username: 'victim' }
  assert.deepEqual(resolveAccountArchivePaths([legacy, forged], 'owner'), {
    status: 'owner_mismatch',
    uploadIds: ['8'],
    codes: ['archive_owner_mismatch'],
  })
  assert.deepEqual(resolveAccountArchivePaths([legacy], null), {
    status: 'owner_mismatch',
    uploadIds: ['6'],
    codes: ['archive_owner_unverified'],
  })
})
