jest.mock('../classifier', () => {
  class ScoringError extends Error {
    constructor(
      message: string,
      readonly costUsd: number,
    ) {
      super(message)
    }
  }
  return {
    ScoringError,
    scoreTweets: jest.fn(
      async (_criterion: string, items: { id: string }[]) => ({
        scores: new Map(items.map((item, i) => [item.id, i === 0 ? 0.9 : 0.2])),
        scorer: 'decisions',
        costUsd: 0.01,
      }),
    ),
  }
})
jest.mock('../gateway', () => ({
  searchTweets: jest.fn(),
  getTweetsByIds: jest.fn(),
  findMembers: jest.fn(async () => [
    { accountId: '1', username: 'visakanv', displayName: 'Visakan' },
  ]),
  getQuotePosts: jest.fn(),
  getTweetDetails: jest.fn(),
  getTweetThread: jest.fn(),
  getUser: jest.fn(async () => null),
}))
jest.mock('../semantic', () => ({
  ...jest.requireActual('../semantic'),
  semanticSearch: jest.fn(),
}))

import { getTweetsByIds, searchTweets } from '../gateway'
import { semanticSearch } from '../semantic'
import { applyChanges, type WorkspaceManifest } from './manifest'
import { bashModelOutput } from './output'
import {
  WorkspaceUnavailableError,
  idsInOutput,
  runBashCommand,
} from './workspace'

const tweet = (id: string, username = 'alice') => ({
  id,
  username,
  name: username,
  avatar: null,
  text: `tweet ${id} about singapore`,
  observedAt: '2025-01-01T00:00:00.000Z',
  createdAt: `2025-01-0${(Number(id) % 9) + 1}T00:00:00.000Z`,
  likes: Number(id),
  rts: 0,
  replyToTweetId: null,
  replyToUsername: null,
  quoteTweetId: null,
})

let archive: Map<string, ReturnType<typeof tweet>>

beforeEach(() => {
  jest.clearAllMocks()
  archive = new Map(
    ['1', '2', '3', '4'].map((id) => [
      id,
      tweet(id, id === '4' ? 'bob' : 'alice'),
    ]),
  )
  ;(searchTweets as jest.Mock).mockImplementation(
    async ({ limit = 25, offset = 0 }) => {
      const all = Array.from(archive.values())
      const page = all.slice(offset, offset + limit)
      return {
        tweets: page,
        nextOffset: offset + limit < all.length ? offset + limit : null,
      }
    },
  )
  ;(getTweetsByIds as jest.Mock).mockImplementation(async (ids: string[]) =>
    ids.flatMap((id) => (archive.has(id) ? [archive.get(id)] : [])),
  )
})

async function run(
  command: string,
  manifest: WorkspaceManifest = {},
  semanticUsed = 0,
) {
  return runBashCommand({
    command,
    manifest,
    semanticUsed,
    limits: { deadlineAt: Date.now() + 60_000 },
  })
}

describe('the bash workspace', () => {
  test('search writes a tweet file the next command reads back by reference', async () => {
    const first = await run('search singapore > s1.jsonl')
    expect(first.exitCode).toBe(0)
    expect(first.files).toEqual({ 's1.jsonl': ['1', '2', '3', '4'] })
    expect(first.summary).toBe('Searched “singapore” · 4 tweets')
    expect(first.stderr).toContain('4 tweets · 2 authors')
    expect(first.tweets.map((t) => t.id)).toEqual(['1', '2', '3', '4'])
    // The manifest keeps ids, never tweet text.
    expect(JSON.stringify(first.workspace)).not.toContain('about singapore')

    // A later command, in a fresh shell, rebuilds the file from the gateway.
    const manifest = applyChanges({}, first.workspace)
    archive.delete('2') // opted out since: drops out of the rebuilt file
    const second = await run(
      'mkdir -p lists && jq -c \'select(.author == "@alice")\' s1.jsonl > lists/alice.jsonl && wc -l < lists/alice.jsonl',
      manifest,
    )
    expect(second.stdout.trim()).toBe('2')
    expect(second.files).toEqual({ 'lists/alice.jsonl': ['1', '3'] })
    expect(second.summary).toBe('Wrote lists/alice.jsonl · 2 tweets')
  })

  test('jq and awk handle a few thousand tweets (the hardened caps stopped at 10,000 iterations)', async () => {
    const ids = Array.from({ length: 3000 }, (_, i) => String(1000 + i))
    for (const id of ids) archive.set(id, tweet(id))
    const manifest: WorkspaceManifest = {
      'all.jsonl': { kind: 'tweets', rows: ids.map((id) => ({ id, p: 0.7 })) },
    }
    const out = await run(
      "jq -c '{p,author,date,text:.text[:50]}' all.jsonl | wc -l; awk 'END{print NR}' all.jsonl",
      manifest,
    )
    expect(out.stderr).toBe('')
    expect(out.stdout.split('\n').map((line) => line.trim())).toEqual([
      '3000',
      '3000',
      '',
    ])
  })

  test('only files a command reads are fetched', async () => {
    const manifest = applyChanges(
      {},
      {
        'a.jsonl': { kind: 'tweets', rows: [{ id: '1' }] },
        'b.jsonl': { kind: 'tweets', rows: [{ id: '3' }] },
      },
    )
    await run('cat a.jsonl > /dev/null', manifest)
    expect(getTweetsByIds).toHaveBeenCalledTimes(1)
    expect((getTweetsByIds as jest.Mock).mock.calls[0][0]).toEqual(['1'])
  })

  test('score keeps the scores in the file and reports what it spent', async () => {
    const first = await run('search singapore > s1.jsonl')
    const out = await run(
      'score s1.jsonl "Does this tweet talk about living in Singapore?" > c1.jsonl',
      applyChanges({}, first.workspace),
    )
    expect(out.costUsd).toBe(0.01)
    expect(out.summary).toBe('Checked 4 tweets · 1 relevant')
    const c1 = out.workspace['c1.jsonl']
    expect(c1?.kind === 'tweets' && c1.rows[0]).toEqual({ id: '1', p: 0.9 })
  })

  test('agent-added fields are kept, long strings are not', async () => {
    const out = await run(
      `echo '{"id":"1","group":"expat","note":"${'x'.repeat(80)}","text":"t"}' > g.jsonl`,
    )
    expect(out.workspace['g.jsonl']).toEqual({
      kind: 'tweets',
      rows: [{ id: '1', x: { group: 'expat' } }],
    })
  })

  test('removing and moving files show up as changes', async () => {
    const manifest = applyChanges(
      {},
      { 'a.jsonl': { kind: 'tweets', rows: [{ id: '1' }] } },
    )
    const out = await run('mv a.jsonl b.jsonl', manifest)
    expect(out.workspace).toEqual({
      'a.jsonl': null,
      'b.jsonl': { kind: 'tweets', rows: [{ id: '1' }] },
    })
  })

  test('a command whose every archive call fails says the archive is down', async () => {
    ;(searchTweets as jest.Mock).mockRejectedValue(new Error('fetch failed'))
    await expect(run('search x > s1.jsonl; search y')).rejects.toBeInstanceOf(
      WorkspaceUnavailableError,
    )
  })

  test('a usage mistake is a shell error, not an outage', async () => {
    const out = await run('search --since yesterday x')
    expect(out.exitCode).toBe(2)
    expect(out.stderr).toContain('--since must be YYYY-MM-DD')
  })

  test('semantic search writes rows with distance, at most twice a question', async () => {
    ;(semanticSearch as jest.Mock).mockResolvedValue({
      query: 'moving there',
      matched: 1,
      tweets: [{ ...tweet('3'), distance: 0.91 }],
    })
    const out = await run('semantic "moving there for work" > m1.jsonl', {}, 1)
    expect(out.semanticCalls).toBe(1)
    expect(out.workspace['m1.jsonl']).toEqual({
      kind: 'tweets',
      rows: [{ id: '3', x: { distance: 0.91 } }],
    })
    expect(out.stderr).toContain('0 semantic searches left')

    const capped = await run('semantic "again"', {}, 2)
    expect(capped.exitCode).toBe(1)
    expect(capped.stderr).toContain('use keyword search instead')
    expect(semanticSearch).toHaveBeenCalledTimes(1)
  })

  test('a failed semantic search is not an archive outage', async () => {
    ;(semanticSearch as jest.Mock).mockRejectedValue(new Error('timeout'))
    const out = await run('semantic "anything at all"')
    expect(out.exitCode).toBe(1)
  })

  test('tweets the model saw on stdout reach the page too', async () => {
    const out = await run('search singapore | head -1')
    expect(out.tweets.map((t) => t.id)).toEqual(['1'])
    expect(idsInOutput('{"id":"12","x":1}\n123456789012345678\n')).toEqual([
      '12',
      '123456789012345678',
    ])
  })
})

describe('what the model sees of a command', () => {
  test('long output is cut with a note, and the summary on stderr stays', () => {
    const stdout = Array.from(
      { length: 500 },
      (_, i) => `{"id":"${i}","text":"${'y'.repeat(40)}"}`,
    ).join('\n')
    const view = bashModelOutput({
      stdout,
      stderr: 'search: 500 tweets\n',
      exitCode: 0,
    })
    expect(view.output.length).toBeLessThan(4200)
    expect(view.output).toMatch(/… \d+ more lines not shown/)
    expect(view.output).toContain('search: 500 tweets')
  })

  test('a stored earlier turn shows its summary and files', () => {
    expect(
      bashModelOutput({
        summary: 'Searched “x” · 2 tweets',
        files: { 's1.jsonl': ['1', '2'] },
      }),
    ).toEqual({
      output: 'Searched “x” · 2 tweets\ns1.jsonl · 2 tweets',
      exitCode: 0,
    })
  })
})
