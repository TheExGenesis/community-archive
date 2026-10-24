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
  // Batched lookups go through the mocked single lookup, 100 ids at a time.
  getTweetsByIdsBatched: jest.fn(async (ids: string[], limits: unknown) => {
    const { getTweetsByIds } = jest.requireMock('../gateway')
    const found: unknown[] = []
    for (let i = 0; i < ids.length; i += 100)
      found.push(...(await getTweetsByIds(ids.slice(i, i + 100), limits)))
    return found
  }),
  getAccountTweets: jest.fn(),
  ApiV1Error: class ApiV1Error extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message)
    }
  },
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

import {
  ApiV1Error,
  getAccountTweets,
  getQuotePosts,
  getTweetDetails,
  getTweetThread,
  getTweetsByIds,
  searchTweets,
} from '../gateway'
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

describe('search with several words', () => {
  const asked = () =>
    (searchTweets as jest.Mock).mock.calls.map(([input]) => input)

  test('matches every word by default, and says so', async () => {
    const out = await run('search community archive > s1.jsonl')
    expect(out.exitCode).toBe(0)
    expect(asked()).toEqual([
      expect.objectContaining({ query: 'community archive', mode: 'all' }),
    ])
    expect(out.stderr).toContain('search all of “community archive”: 4 tweets')
    // The page's line is unchanged.
    expect(out.summary).toBe('Searched “community archive” · 4 tweets')
  })

  test('--phrase asks for the exact phrase', async () => {
    const out = await run('search "community archive" --phrase')
    expect(out.exitCode).toBe(0)
    expect(asked()).toEqual([
      expect.objectContaining({ query: 'community archive', mode: 'phrase' }),
    ])
    expect(out.stderr).toContain(
      'search “community archive” as a phrase: 4 tweets',
    )
  })

  test('--all, the old default-changing flag, still parses and matches every word', async () => {
    const out = await run('search community archive --all')
    expect(out.exitCode).toBe(0)
    expect(asked()[0]).toMatchObject({ mode: 'all' })
    expect(out.stderr).toContain('search all of “community archive”')
  })

  test('one word reads as before', async () => {
    const out = await run('search singapore')
    expect(asked()[0]).toMatchObject({ query: 'singapore', mode: 'all' })
    expect(out.stderr).toContain('search “singapore”: 4 tweets')
  })

  test('--or searches every alternative with the same mode, sort and reply filter', async () => {
    const out = await run(
      'search "community archive" --or "ca dot org",tpot --phrase --sort likes --reply-to @visakanv --from bob',
    )
    expect(out.exitCode).toBe(0)
    const calls = asked()
    expect(calls.map((input) => input.query).sort()).toEqual([
      'ca dot org',
      'community archive',
      'tpot',
    ])
    for (const input of calls) {
      expect(input).toMatchObject({
        mode: 'phrase',
        sort: 'likes',
        replyToUser: 'visakanv',
        fromUser: 'bob',
      })
    }
    expect(out.stderr).toContain(
      'search “community archive” or “ca dot org” or “tpot” (each as a phrase), any of them matching from @bob replying to @visakanv: 4 tweets',
    )

    jest.clearAllMocks()
    const words = await run('search ca --or "community archive"')
    expect(asked().map((input) => input.mode)).toEqual(['all', 'all'])
    expect(words.stderr).toContain(
      'search “ca” or “community archive” (all words of each), any of them matching:',
    )
  })

  test('--with keeps the words and adds one of the others, one search per pair', async () => {
    const out = await run(
      'search "community archive" --with creepy,"opt out" --since 2025-01-01',
    )
    expect(out.exitCode).toBe(0)
    const calls = asked()
    expect(calls.map((input) => input.query).sort()).toEqual([
      'community archive creepy',
      'community archive opt out',
    ])
    for (const input of calls) {
      expect(input).toMatchObject({ mode: 'all', since: '2025-01-01' })
    }
    expect(out.stderr).toContain(
      'search all of “community archive” and one of “creepy”, “opt out”:',
    )
    expect(out.summary).toContain(
      'Searched “community archive” with “creepy” or “opt out”',
    )

    // One --with word is one search, of the words and that word together.
    jest.clearAllMocks()
    await run('search notion --with slow')
    expect(asked().map((input) => input.query)).toEqual(['notion slow'])

    // --or and --with together: every alternative with every word.
    jest.clearAllMocks()
    await run('search notion --or @NotionHQ --with slow,offline')
    expect(
      asked()
        .map((input) => input.query)
        .sort(),
    ).toEqual([
      '@NotionHQ offline',
      '@NotionHQ slow',
      'notion offline',
      'notion slow',
    ])
  })

  test('--any is gone, and the error says which flag to use', async () => {
    const out = await run('search "community archive" --any creepy,privacy')
    expect(out.exitCode).toBe(2)
    expect(out.stderr).toContain('there is no --any')
    expect(out.stderr).toContain('--or a,b')
    expect(out.stderr).toContain('--with a,b')
    expect(asked()).toEqual([])
  })

  test('--with refuses a phrase and too many searches', async () => {
    const phrase = await run(
      'search "community archive" --phrase --with creepy',
    )
    expect(phrase.exitCode).toBe(2)
    expect(phrase.stderr).toContain('cannot keep a phrase')
    const many = await run('search a --or b,c,d --with e,f,g')
    expect(many.exitCode).toBe(2)
    expect(many.stderr).toContain('at most 9')
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

  test('reports where the command spent its time', async () => {
    ;(getTweetDetails as jest.Mock).mockResolvedValue([tweet('3')])
    const result = await run('show 3; echo done')
    expect(result.timing).toMatchObject({
      phases: { show: expect.any(Number) },
      execMs: expect.any(Number),
      pageMs: expect.any(Number),
    })
    expect(result.timing!.spans.map((span) => span.slice(0, 3))).toContainEqual(
      ['phase', 'shell', 'show'],
    )
    // The page never receives it.
    expect(streamedBashOutput(result, new Set()).timing).toBeUndefined()
  })

  test('show prints one tweet in full', async () => {
    ;(getTweetDetails as jest.Mock).mockResolvedValue([tweet('3')])
    const result = await run('show 3')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('@alice')
    expect(result.stdout).toContain('tweet 3 about singapore')
  })
})

describe('timeline', () => {
  test("reads one person's tweets page by page, newest first, without retweets", async () => {
    ;(getAccountTweets as jest.Mock).mockImplementation(async ({ cursor }) =>
      cursor === 'c1'
        ? { tweets: [tweet('3')], nextCursor: null }
        : { tweets: [tweet('1'), tweet('2')], nextCursor: 'c1' },
    )
    const result = await run('timeline @alice --until 2025-01-31 > a.jsonl')
    expect(result.exitCode).toBe(0)
    expect(result.files).toEqual({ 'a.jsonl': ['1', '2', '3'] })
    expect(result.summary).toBe("Read @alice's tweets · 3 tweets")
    expect((getAccountTweets as jest.Mock).mock.calls[0][0]).toMatchObject({
      account: '@alice',
      order: 'desc',
      // --until is inclusive; the API's is exclusive.
      until: '2025-02-01',
      excludeReplies: false,
      excludeRetweets: true,
      limit: 200,
    })
    expect((getAccountTweets as jest.Mock).mock.calls[1][0].cursor).toBe('c1')
  })

  test('takes the oldest first, drops replies, keeps retweets and caps the count', async () => {
    ;(getAccountTweets as jest.Mock).mockResolvedValue({
      tweets: Array.from({ length: 50 }, (_, i) => tweet(String(i + 1))),
      nextCursor: 'more',
    })
    const result = await run(
      'timeline maskys_ --oldest --no-replies --retweets --limit 50',
    )
    expect((getAccountTweets as jest.Mock).mock.calls[0][0]).toMatchObject({
      account: '@maskys_',
      order: 'asc',
      excludeReplies: true,
      excludeRetweets: false,
      limit: 50,
    })
    expect(result.stderr).toContain('more exist')
  })

  test('says when the person is not in the archive', async () => {
    ;(getAccountTweets as jest.Mock).mockRejectedValue(
      new ApiV1Error(404, 'not_found', 'account not found'),
    )
    const result = await run('timeline @nobody_here')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('no such member')
  })

  test('an empty or short page with a cursor is not the end', async () => {
    // The API leaves deleted tweets out of a page.
    const pages: Record<
      string,
      { tweets: unknown[]; nextCursor: string | null }
    > = {
      start: { tweets: [tweet('1'), tweet('2')], nextCursor: 'c1' },
      c1: { tweets: [], nextCursor: 'c2' },
      c2: { tweets: [tweet('3')], nextCursor: null },
    }
    ;(getAccountTweets as jest.Mock).mockImplementation(
      async ({ cursor }) => pages[cursor ?? 'start'],
    )
    const result = await run('timeline @alice > a.jsonl')
    expect(result.exitCode).toBe(0)
    expect(result.files).toEqual({ 'a.jsonl': ['1', '2', '3'] })
    expect(getAccountTweets).toHaveBeenCalledTimes(3)
    expect(result.stderr).not.toContain('more')
  })

  test('stops on a cursor it already followed, or after a bounded number of pages', async () => {
    ;(getAccountTweets as jest.Mock).mockResolvedValue({
      tweets: [tweet('1')],
      nextCursor: 'same',
    })
    const stuck = await run('timeline @alice')
    expect(stuck.exitCode).toBe(0)
    expect(getAccountTweets).toHaveBeenCalledTimes(2)
    expect(stuck.stderr).toContain('same page cursor twice; more may exist')

    jest.clearAllMocks()
    let n = 0
    ;(getAccountTweets as jest.Mock).mockImplementation(async () => ({
      tweets: [],
      nextCursor: `c${++n}`,
    }))
    const endless = await run('timeline @alice --limit 300')
    // ceil(300 / 200) + 10 pages.
    expect(getAccountTweets).toHaveBeenCalledTimes(12)
    expect(endless.stderr).toContain('stopped after 12 pages; more may exist')
  })

  test('a request too broad for the query budget prints the pages read, marked partial', async () => {
    ;(getAccountTweets as jest.Mock).mockImplementation(async ({ cursor }) => {
      if (cursor) {
        throw new ApiV1Error(
          422,
          'query_budget_exceeded',
          'The request is too broad',
        )
      }
      return { tweets: [tweet('1'), tweet('2')], nextCursor: 'c1' }
    })
    const result = await run('timeline @alice > a.jsonl')
    expect(result.exitCode).toBe(1)
    expect(result.files).toEqual({ 'a.jsonl': ['1', '2'] })
    expect(result.stderr).toContain(
      "timeline @alice: too broad for the API's query budget; narrow it with --since/--until · partial results: 2 tweets",
    )
    expect(result.summary).toBe("Read @alice's tweets · 2 tweets, partial")
    ;(getAccountTweets as jest.Mock).mockRejectedValue(
      new ApiV1Error(422, 'query_budget_exceeded', 'The request is too broad'),
    )
    const none = await run('timeline @alice')
    expect(none.exitCode).toBe(1)
    expect(none.stdout).toBe('')
    expect(none.stderr).toContain('narrow it with --since/--until')
    expect(none.stderr).not.toContain('partial')
  })
})

describe('expand', () => {
  // Seed X's thread is X itself (the tweet the gateway returns with its
  // conversation) and replies X0, X1; its quote posts are X5.
  const conversations: Record<string, { thread: string[]; quotes: string[] }> =
    {}
  const conversationOf = (id: string) =>
    conversations[id] ?? { thread: [`${id}0`, `${id}1`], quotes: [`${id}5`] }

  /** A scored file, as score leaves it in the manifest. */
  const scoredFile = (rows: Array<[string, number?]>): WorkspaceManifest => {
    for (const [id] of rows) if (!archive.has(id)) archive.set(id, tweet(id))
    return {
      'c1.jsonl': {
        kind: 'tweets',
        rows: rows.map(([id, p]) => (p === undefined ? { id } : { id, p })),
      },
    }
  }

  beforeEach(() => {
    for (const key of Object.keys(conversations)) delete conversations[key]
    ;(getTweetThread as jest.Mock).mockImplementation(async (id: string) => ({
      tweet: tweet(id),
      conversation: conversationOf(id).thread.map((reply) => tweet(reply)),
    }))
    ;(getQuotePosts as jest.Mock).mockImplementation(async (id: string) => {
      const quotes = conversationOf(id).quotes.map((q) => tweet(q, 'carol'))
      return { tweets: quotes, total: quotes.length }
    })
  })

  const threadIds = () =>
    (getTweetThread as jest.Mock).mock.calls.map((call) => call[0])

  test('expands the highest-p tweets, best first, up to --seeds', async () => {
    const manifest = scoredFile([
      ['1', 0.75],
      ['2', 0.95],
      ['3', 0.5],
      ['4', 0.85],
      ['5', 0.9],
    ])
    const out = await run('expand c1.jsonl --seeds 2 > e1.jsonl', manifest)
    expect(out.exitCode).toBe(0)
    expect(threadIds()).toEqual(['2', '5'])
    expect((getQuotePosts as jest.Mock).mock.calls.map((c) => c[0])).toEqual([
      '2',
      '5',
    ])
    // Seed order, then each call's order: thread before quotes.
    expect(out.files).toEqual({
      'e1.jsonl': ['20', '21', '25', '50', '51', '55'],
    })
    // Rows carry no p, and the tweets reach the page from the cache.
    const e1 = out.workspace['e1.jsonl']
    expect(e1?.kind === 'tweets' && e1.rows.some((row) => 'p' in row)).toBe(
      false,
    )
    expect(out.tweets.map((t) => t.id)).toEqual([
      '20',
      '21',
      '25',
      '50',
      '51',
      '55',
    ])
    expect(out.stderr).toBe(
      'expand c1.jsonl: 2 seeds · 6 new tweets · 2 authors · 2025-01-02 to 2025-01-08\n',
    )
    expect(out.summary).toBe("Expanded 2 tweets' conversations · 6 tweets")

    // By default, every tweet at or above 0.7, at most 15 of them.
    jest.clearAllMocks()
    await run('expand c1.jsonl', manifest)
    expect(threadIds()).toEqual(['2', '5', '4', '1'])
    jest.clearAllMocks()
    await run('expand c1.jsonl --min-p 0.5 --seeds 99', manifest)
    expect(threadIds()).toEqual(['2', '5', '4', '1', '3'])
  })

  test('leaves out tweets already in the file and the seeds, and prints each tweet once', async () => {
    conversations['1'] = { thread: ['2', '4', '9'], quotes: ['1', '10'] }
    conversations['4'] = { thread: ['1', '9', '11'], quotes: ['10', '12'] }
    const out = await run(
      'expand c1.jsonl',
      scoredFile([
        ['1', 0.9],
        ['2', 0.2],
        ['4', 0.8],
      ]),
    )
    expect(
      out.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).id),
    ).toEqual(['9', '10', '11', '12'])
    expect(out.stderr).toContain('2 seeds · 4 new tweets')
  })

  test('--limit caps the tweets printed, and stderr says so', async () => {
    const out = await run(
      'expand c1.jsonl --limit 4',
      scoredFile([
        ['1', 0.9],
        ['2', 0.8],
      ]),
    )
    expect(
      out.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).id),
    ).toEqual(['10', '11', '15', '20'])
    expect(out.stderr).toContain(
      '2 seeds · 4 new tweets · 2 authors · 2025-01-02 to 2025-01-07 · capped at 4 of 6 (raise --limit, max 1000)',
    )
  })

  test('a file without scores is a usage mistake', async () => {
    const out = await run('expand c1.jsonl', scoredFile([['1'], ['2']]))
    expect(out.exitCode).toBe(2)
    expect(out.stderr).toContain(
      'c1.jsonl has no p values; score it first (score c1.jsonl',
    )
    expect(out.stderr).toContain(USAGE.expand)
    expect(getTweetThread).not.toHaveBeenCalled()
  })

  test('a file with no tweet at or above --min-p prints nothing and succeeds', async () => {
    const out = await run(
      'expand c1.jsonl --min-p 0.95',
      scoredFile([
        ['1', 0.9],
        ['2', 0.4],
      ]),
    )
    expect(out.exitCode).toBe(0)
    expect(out.stdout).toBe('')
    expect(out.stderr).toContain('no tweet has p ≥ 0.95; nothing to expand')
    expect(getTweetThread).not.toHaveBeenCalled()
    expect(getQuotePosts).not.toHaveBeenCalled()
  })

  test('a failing seed is counted; every call failing reads as the archive down', async () => {
    const manifest = scoredFile([
      ['1', 0.9],
      ['2', 0.8],
    ])
    ;(getTweetThread as jest.Mock).mockImplementation(async (id: string) => {
      if (id === '1') throw new Error('fetch failed')
      return { tweet: tweet(id), conversation: [tweet('20')] }
    })
    const some = await run('expand c1.jsonl', manifest)
    expect(some.exitCode).toBe(0)
    // Seed 1's quotes still count.
    expect(
      some.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).id),
    ).toEqual(['15', '20', '25'])
    expect(some.stderr).toContain('· 1 of 2 seeds failed')
    ;(getTweetThread as jest.Mock).mockRejectedValue(new Error('fetch failed'))
    ;(getQuotePosts as jest.Mock).mockRejectedValue(new Error('fetch failed'))
    // The file was rebuilt through the gateway, so the archive answered once.
    const rebuilt = await run('expand c1.jsonl', manifest)
    expect(rebuilt.exitCode).toBe(1)
    expect(rebuilt.stderr).toBe('expand: fetch failed\n')
    // Written in the same command, no call answered.
    await expect(
      run(`echo '{"id":"1","p":0.9}' > c2.jsonl; expand c2.jsonl`),
    ).rejects.toBeInstanceOf(WorkspaceUnavailableError)
    // Nor did the file's rebuild.
    ;(getTweetsByIds as jest.Mock).mockRejectedValue(new Error('fetch failed'))
    await expect(run('expand c1.jsonl', manifest)).rejects.toBeInstanceOf(
      WorkspaceUnavailableError,
    )
  })

  test('expands at most four seeds at a time', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => String(i + 1))
    const manifest = scoredFile(ids.map((id) => [id, 0.9]))
    const pending = new Map<string, number>()
    let mostSeeds = 0
    let mostCalls = 0
    let calls = 0
    const slow =
      <T>(inner: (id: string) => Promise<T>) =>
      async (id: string) => {
        pending.set(id, (pending.get(id) ?? 0) + 1)
        calls += 1
        mostSeeds = Math.max(mostSeeds, pending.size)
        mostCalls = Math.max(mostCalls, calls)
        await new Promise((resolve) => setTimeout(resolve, 10))
        calls -= 1
        const left = pending.get(id)! - 1
        if (left) pending.set(id, left)
        else pending.delete(id)
        return inner(id)
      }
    ;(getTweetThread as jest.Mock).mockImplementation(
      slow((getTweetThread as jest.Mock).getMockImplementation()!),
    )
    ;(getQuotePosts as jest.Mock).mockImplementation(
      slow((getQuotePosts as jest.Mock).getMockImplementation()!),
    )
    const out = await run('expand c1.jsonl --seeds 10', manifest)
    expect(out.exitCode).toBe(0)
    expect(getTweetThread).toHaveBeenCalledTimes(10)
    expect(mostSeeds).toBe(4)
    expect(mostCalls).toBe(8)
  })
})

describe('par', () => {
  test('runs archive commands at once and keeps their order', async () => {
    const inner = (searchTweets as jest.Mock).getMockImplementation()!
    let inFlight = 0
    let most = 0
    ;(searchTweets as jest.Mock).mockImplementation(async (input) => {
      most = Math.max(most, ++inFlight)
      await new Promise((resolve) => setTimeout(resolve, 20))
      inFlight--
      return inner(input)
    })
    const result = await run(
      `par 'search "{}" > s_{}.jsonl' singapore about; ls`,
    )
    expect(result.exitCode).toBe(0)
    expect(most).toBe(2)
    expect(Object.keys(result.files).sort()).toEqual([
      's_about.jsonl',
      's_singapore.jsonl',
    ])
    expect(result.stderr.indexOf('“singapore”')).toBeLessThan(
      result.stderr.indexOf('“about”'),
    )
  })

  test('runs each argument as its own line, and refuses an empty or oversized call', async () => {
    const both = await run(`par 'echo one' 'echo two'`)
    expect(both.stdout).toBe('one\ntwo\n')
    const empty = await run(`par 'search {}'`)
    expect(empty.exitCode).toBe(2)
    const words = Array.from({ length: 31 }, (_, i) => `w${i}`).join(' ')
    const many = await run(`par 'echo {}' ${words}`)
    expect(many.exitCode).toBe(2)
    expect(many.stderr).toContain('at most 30')
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
