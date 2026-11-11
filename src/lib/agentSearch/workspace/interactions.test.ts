jest.mock('../classifier', () => ({
  ScoringError: class extends Error {},
  scoreTweets: jest.fn(),
}))
jest.mock('../policy', () => ({
  isPolicyBlockedAccount: jest.fn(async () => false),
}))
jest.mock('../gateway', () => ({
  searchTweets: jest.fn(),
  getTweetsByIds: jest.fn(async () => []),
  findMembers: jest.fn(async () => []),
  getQuotePosts: jest.fn(),
  getTweetDetails: jest.fn(),
  getTweetThread: jest.fn(),
  getUser: jest.fn(async () => null),
  getInteractions: jest.fn(),
  getInteractionTies: jest.fn(),
}))
jest.mock('../semantic', () => ({
  ...jest.requireActual('../semantic'),
  semanticSearch: jest.fn(),
}))

import { getInteractionTies, getInteractions } from '../gateway'
import { isPolicyBlockedAccount } from '../policy'
import { interactionTiesImpl, interactionsImpl } from '../toolImpl'
import { runBashCommand } from './workspace'

const zero = { tweets: 0, replies: 0, mentions: 0, quotes: 0 }
const projection = {
  buildId: 'b1',
  builtAt: '2026-11-11T00:00:00Z',
  coveredUntil: '2026-12',
}
const focus = { id: '1', username: 'focus', name: 'Focus', isMember: false }

const peer = (id: string, username: string | null, mutual = true) => ({
  id,
  username,
  name: username,
  isMember: id === '2',
  mutual,
  out: { tweets: 3, replies: 2, mentions: 1, quotes: 0 },
  in: mutual ? { tweets: 1, replies: 1, mentions: 0, quotes: 0 } : zero,
  firstMonth: '2023-02',
  lastMonth: '2023-11',
})

const peers = {
  a: focus,
  since: '2023-01',
  until: '2023-12',
  peerCount: 40,
  mutualCount: 7,
  mutualMemberCount: 3,
  truncated: true,
  peers: [
    peer('2', 'member'),
    peer('3', 'optedout'),
    peer('4', null),
    peer('5', 'stranger', false),
  ],
  projection,
}

const run = (command: string) =>
  runBashCommand({
    command,
    manifest: {},
    semanticUsed: 0,
    limits: { deadlineAt: Date.now() + 60_000 },
  })

beforeEach(() => {
  jest.clearAllMocks()
  ;(isPolicyBlockedAccount as jest.Mock).mockImplementation(
    async (id: string) => id === '3',
  )
})

describe('interactions', () => {
  test('lists peers both ways, without withheld or unnamed accounts', async () => {
    ;(getInteractions as jest.Mock).mockResolvedValue(peers)
    const result = await run(
      'interactions @focus --since 2023-01 --until 2023-12-31 > p.jsonl; jq -r .handle p.jsonl',
    )
    expect(result.exitCode).toBe(0)
    expect(getInteractions).toHaveBeenCalledWith(
      {
        a: 'focus',
        b: undefined,
        since: '2023-01',
        until: '2023-12',
        limit: 25,
      },
      expect.anything(),
    )
    expect(result.stdout.trim().split('\n')).toEqual(['@member', '@stranger'])
    expect(result.stderr).toContain(
      'interactions @focus (2023-01 to 2023-12, out = from @focus): 2 of 40 accounts · 7 both ways, 3 of them members',
    )
    expect(result.summary).toBe('Interactions of @focus · 40 accounts')
  })

  test('with two handles prints the monthly timeline', async () => {
    ;(getInteractions as jest.Mock).mockResolvedValue({
      a: focus,
      b: { id: '2', username: 'member', name: 'Member', isMember: true },
      since: null,
      until: null,
      months: [
        {
          month: '2022-03',
          aToB: { ...zero, tweets: 2, replies: 2 },
          bToA: zero,
        },
        {
          month: '2022-06',
          aToB: zero,
          bToA: { ...zero, tweets: 1, quotes: 1 },
        },
      ],
      totals: {
        aToB: { ...zero, tweets: 2, replies: 2 },
        bToA: { ...zero, tweets: 1, quotes: 1 },
      },
      firstMonth: '2022-03',
      firstMutualMonth: '2022-06',
      projection,
    })
    const result = await run('interactions focus @member')
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.split('\n')[1])).toEqual({
      month: '2022-06',
      out: zero,
      in: { ...zero, tweets: 1, quotes: 1 },
    })
    expect(result.stderr).toContain(
      '2 active months · first 2022-03 · both ways by 2022-06 · @focus→@member 2 tweets · @member→@focus 1 tweet',
    )
  })

  test('a withheld or unknown account is not found, and bad input is a usage error', async () => {
    ;(getInteractions as jest.Mock).mockResolvedValue({
      ...peers,
      a: { ...focus, id: '3', username: 'optedout' },
    })
    expect((await run('interactions @optedout')).stderr).toContain('not found')
    ;(getInteractions as jest.Mock).mockResolvedValue(null)
    expect((await run('interactions @nobody')).exitCode).toBe(1)
    for (const command of [
      'interactions',
      'interactions a b c',
      'interactions @a --since 2023',
      'interactions @a --since 2024-01 --until 2023-01',
      'interactions "bad handle"',
    ]) {
      expect((await run(command)).exitCode).toBe(2)
    }
    expect(getInteractions).toHaveBeenCalledTimes(2)
  })
})

describe('ties', () => {
  const tiesFor = (handles: string[], before: string) => ({
    before,
    months: 12,
    window: { from: '2023-06', until: before },
    accounts: handles.map((input) =>
      input === 'ghost'
        ? { input, account: null, error: 'not_found' }
        : {
            input,
            account: {
              id: input === 'optedout' ? '3' : `id-${input}`,
              username: input,
              name: input,
              isMember: false,
            },
            peers: 9,
            mutualPeers: 4,
            mutualMembers: 2,
            tweetsToMembers: 6,
            tweetsFromMembers: 5,
            topMutual: [
              {
                id: '2',
                username: 'member',
                name: 'Member',
                isMember: true,
                outTweets: 3,
                inTweets: 2,
                firstMonth: '2023-08',
              },
              {
                id: '3',
                username: 'optedout',
                name: 'Gone',
                isMember: true,
                outTweets: 9,
                inTweets: 9,
                firstMonth: '2023-07',
              },
            ],
          },
    ),
    projection,
  })

  beforeEach(() => {
    ;(getInteractionTies as jest.Mock).mockImplementation(
      async ({ accounts, before }) => tiesFor(accounts, before),
    )
  })

  test('reports member ties before a month, dropping withheld peers', async () => {
    const result = await run('ties @alice ghost --before 2024-06')
    expect(result.exitCode).toBe(0)
    expect(getInteractionTies).toHaveBeenCalledWith(
      { accounts: ['alice', 'ghost'], before: '2024-06', months: 12, peers: 5 },
      expect.anything(),
    )
    const [alice, ghost] = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(alice).toEqual({
      handle: '@alice',
      member: false,
      before: '2024-06',
      mutual_members: 2,
      mutual: 4,
      peers: 9,
      to_members: 6,
      from_members: 5,
      top: [
        { handle: '@member', member: true, out: 3, in: 2, first: '2023-08' },
      ],
    })
    expect(ghost).toEqual({
      handle: '@ghost',
      before: '2024-06',
      error: 'not found',
    })
    expect(result.stderr).toContain('12 months before 2024-06')
    expect(result.stderr).toContain('@alice 2 member ties, @ghost not found')
  })

  test('takes each account with its own month on stdin, one call per month', async () => {
    const result = await run(
      `printf '@alice\\t2024-06\\n@bob 2023-01-15\\n@carol\\t2024-06\\n' | ties --months 6`,
    )
    expect(result.exitCode).toBe(0)
    expect(getInteractionTies).toHaveBeenCalledTimes(2)
    expect(
      (getInteractionTies as jest.Mock).mock.calls.map(([input]) => [
        input.before,
        input.accounts,
        input.months,
      ]),
    ).toEqual([
      ['2024-06', ['alice', 'carol'], 6],
      ['2023-01', ['bob'], 6],
    ])
    expect(result.stdout.trim().split('\n')).toHaveLength(3)
    expect(result.stderr).toContain('6 months before each month')
  })

  test('an account policy withholds is not found; bad input is a usage error', async () => {
    const result = await run('ties optedout --before 2024-06')
    expect(JSON.parse(result.stdout)).toEqual({
      handle: '@optedout',
      before: '2024-06',
      error: 'not found',
    })
    for (const command of [
      'ties @a',
      'ties @a --before 2024',
      'echo "@a" | ties',
    ]) {
      const failed = await run(command)
      expect(failed.exitCode).toBe(2)
    }
    // Like --limit elsewhere, a too-large --peers is capped.
    await run('ties @a --before 2024-06 --peers 11')
    expect((getInteractionTies as jest.Mock).mock.calls.at(-1)[0].peers).toBe(
      10,
    )
  })
})

describe('typed tools', () => {
  test('get_interactions drops withheld peers and reports how many were left out', async () => {
    ;(getInteractions as jest.Mock).mockResolvedValue(peers)
    const result = await interactionsImpl({
      account: 'focus',
      other: '',
      since: '2023-01',
    })
    expect(getInteractions).toHaveBeenCalledWith(
      {
        a: 'focus',
        b: undefined,
        since: '2023-01',
        until: undefined,
        limit: undefined,
      },
      {},
    )
    expect('peers' in result && result.peers.map((p) => p.username)).toEqual([
      'member',
      'stranger',
    ])
    expect('omitted' in result && result.omitted).toBe(2)
  })

  test('a failed policy check withholds the account', async () => {
    ;(isPolicyBlockedAccount as jest.Mock).mockRejectedValue(new Error('down'))
    ;(getInteractions as jest.Mock).mockResolvedValue(peers)
    expect(await interactionsImpl({ account: 'focus' })).toEqual({
      notFound: true,
      account: 'focus',
      other: null,
    })
  })

  test('get_interaction_ties withholds blocked focus accounts and peers', async () => {
    ;(getInteractionTies as jest.Mock).mockImplementation(
      async ({ accounts, before }) => ({
        before,
        months: 12,
        window: { from: '2023-06', until: before },
        projection,
        accounts: accounts.map((input: string) => ({
          input,
          account: {
            id: input === 'optedout' ? '3' : '9',
            username: input,
            name: input,
            isMember: false,
          },
          mutualMembers: 1,
          topMutual: [
            {
              id: '3',
              username: 'optedout',
              name: 'x',
              isMember: true,
              outTweets: 1,
              inTweets: 1,
              firstMonth: '2023-07',
            },
          ],
        })),
      }),
    )
    const result = await interactionTiesImpl({
      accounts: ['alice', 'optedout'],
      before: '2024-06',
    })
    expect(result.accounts).toEqual([
      expect.objectContaining({ input: 'alice', topMutual: [] }),
      { input: 'optedout', account: null, error: 'not_found' },
    ])
  })
})
