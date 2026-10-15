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
jest.mock('../policy', () => ({
  isPolicyBlockedAccount: jest.fn(async () => false),
}))
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

import { getTweetDetails, getTweetsByIds, searchTweets } from '../gateway'
import { MAX_SEMANTIC_CALLS_PER_RUN, semanticSearch } from '../semantic'
import { USAGE } from './commands'
import { applyChanges, type WorkspaceManifest } from './manifest'
import { bashModelOutput, streamedBashOutput } from './output'
import {
  WorkspaceUnavailableError,
  idsInOutput,
  runBashCommand,
  scoresInOutput,
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
  replyToTweetId: null as string | null,
  replyToUsername: null as string | null,
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

  test('other code in the process can still set process.env while a command awaits', async () => {
    // A command waiting on the gateway leaves the event loop to other
    // requests; with defense-in-depth on, Next then failed to set process.env.
    let release: () => void = () => {}
    ;(searchTweets as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ tweets: [], nextOffset: null })
        }),
    )
    const pending = run('search singapore > s1.jsonl')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(() => {
      process.env.AGENT_SEARCH_WORKSPACE_TEST = '1'
    }).not.toThrow()
    delete process.env.AGENT_SEARCH_WORKSPACE_TEST
    release()
    expect((await pending).exitCode).toBe(0)
  })

  test('only text tools run, and a failure inside a pipe is not hidden', async () => {
    expect((await run('sqlite3 :memory: "select 1"')).exitCode).not.toBe(0)
    expect((await run('cat missing.jsonl | head -1')).exitCode).not.toBe(0)
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

  test('scores of the files written and of rows printed go to the page', async () => {
    const first = await run('search singapore > s1.jsonl')
    const out = await run(
      'score s1.jsonl "Does this tweet talk about living in Singapore?" > c1.jsonl; echo \'{"id":"9","p":0.333}\'',
      applyChanges({}, first.workspace),
    )
    expect(out.scores).toEqual({
      '1': 0.9,
      '2': 0.2,
      '3': 0.2,
      '4': 0.2,
      '9': 0.33,
    })
    expect(scoresInOutput('{"id":"5","p":1.5}\nnot json')).toEqual({})
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

  test('semantic search writes rows with distance, up to the per-question limit', async () => {
    ;(semanticSearch as jest.Mock).mockResolvedValue({
      query: 'moving there',
      matched: 1,
      tweets: [{ ...tweet('3'), distance: 0.91 }],
    })
    const out = await run(
      'semantic "moving there for work" > m1.jsonl',
      {},
      MAX_SEMANTIC_CALLS_PER_RUN - 1,
    )
    expect(out.semanticCalls).toBe(1)
    expect(out.workspace['m1.jsonl']).toEqual({
      kind: 'tweets',
      rows: [{ id: '3', x: { distance: 0.91 } }],
    })
    expect(out.stderr).toContain('0 semantic searches left')

    const capped = await run('semantic "again"', {}, MAX_SEMANTIC_CALLS_PER_RUN)
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

describe('the tweet ids a command printed', () => {
  test('come from rows, bare lines, and lines of fields an id leads', () => {
    const stdout = [
      '{"id":"1111111111111111111","text":"a"}',
      '2222222222222222222',
      '3333333333333333333\t2026-10-06\tsome text',
      '"4444444444444444444",2026-10-06,"csv"',
      '5555555555555555555 2026-10-06 columns',
    ].join('\n')
    expect(idsInOutput(stdout).sort()).toEqual([
      '1111111111111111111',
      '2222222222222222222',
      '3333333333333333333',
      '4444444444444444444',
      '5555555555555555555',
    ])
  })

  test('but not a long number inside a sentence or a count', () => {
    expect(
      idsInOutput('found 1234567890123456789 matches\n2026-10-06 300 tweets'),
    ).toEqual([])
  })
})

describe('the archive command names', () => {
  test('no archive command is shadowed by a shell builtin', async () => {
    // A builtin runs before a custom command of the same name: `read <id>`
    // ran bash's read and failed on every call.
    for (const name of Object.keys(USAGE)) {
      const result = await run(`type -t ${name}`)
      expect([name, result.stdout.trim()]).not.toEqual([name, 'builtin'])
      expect([name, result.stdout.trim()]).not.toEqual([name, 'keyword'])
    }
  })

  test('a reply keeps the author it answers when its file is rebuilt', async () => {
    archive.set('2', {
      ...tweet('2'),
      replyToTweetId: '4',
      replyToUsername: 'bob',
    })
    const first = await run('search singapore > s1.jsonl')
    // Files are rebuilt through the id lookup, which has no reply author.
    ;(getTweetsByIds as jest.Mock).mockImplementation(async (ids: string[]) =>
      ids.flatMap((id) =>
        archive.has(id) ? [{ ...archive.get(id)!, replyToUsername: null }] : [],
      ),
    )
    const second = await run(
      "jq -r 'select(.replyTo) | .replyToAuthor' s1.jsonl",
      applyChanges({}, first.workspace),
    )
    expect(second.stdout.trim()).toBe('@bob')
  })

  test('show prints one tweet in full', async () => {
    ;(getTweetDetails as jest.Mock).mockResolvedValue([tweet('3')])
    const result = await run('show 3')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('@alice')
    expect(result.stdout).toContain('tweet 3 about singapore')
  })
})

describe('what the page receives of a command', () => {
  test('a tweet already sent in the run goes as its id; stdout is cut after the model view is fixed', async () => {
    const sent = new Set<string>()
    const first = streamedBashOutput(
      await run('search singapore > s1.jsonl'),
      sent,
    )
    expect(first.tweets.map((t) => t.id)).toEqual(['1', '2', '3', '4'])

    const raw = await run(
      `search singapore | head -2; printf '%.0sx\\n' $(seq 1 3000)`,
    )
    const second = streamedBashOutput(raw, sent)
    // Both tweets were sent by the first command: ids stay in the rows.
    expect(second.tweets).toEqual([])
    expect(second.stdout.length).toBeLessThanOrEqual(2000)
    // The model sees exactly what it would have seen of the full output.
    expect(bashModelOutput(second)).toEqual(bashModelOutput(raw))
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
