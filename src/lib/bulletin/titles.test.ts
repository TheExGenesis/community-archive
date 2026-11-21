import { createServerServiceRoleClient } from '@/utils/supabase'
import { getTweetPageData } from '@/lib/getTweetPageData'
import { getTweetPageSummary } from '@/lib/tweetSummary/store'
import { generateBulletinTitles, readBulletinTitles } from './titles'
import type { Notice } from './types'

jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/getTweetPageData', () => ({ getTweetPageData: jest.fn() }))
jest.mock('@/lib/tweetSummary/store', () => ({
  getTweetPageSummary: jest.fn(),
}))

type Row = { subject_key: string; title: string | null; eligible: boolean }
let rows: Row[] = []
let readError: { message: string } | null = null
const queries: { keys: string[]; eligibleOnly: boolean }[] = []

beforeEach(() => {
  jest.clearAllMocks()
  rows = []
  readError = null
  queries.length = 0
  jest.mocked(createServerServiceRoleClient).mockReturnValue({
    from: () => ({
      select: () => {
        const state = { keys: [] as string[], eligibleOnly: false }
        const query = {
          in: (_column: string, keys: string[]) => {
            state.keys = keys
            return query
          },
          eq: (column: string, value: unknown) => {
            if (column === 'eligible' && value === true)
              state.eligibleOnly = true
            return query
          },
          then: (resolve: (value: unknown) => void) => {
            queries.push(state)
            resolve({
              data: readError
                ? null
                : rows.filter(
                    (row) =>
                      state.keys.includes(row.subject_key) &&
                      (!state.eligibleOnly || row.eligible),
                  ),
              error: readError,
            })
          },
        }
        return query
      },
    }),
  } as never)
  jest.mocked(getTweetPageData).mockImplementation(async (id) => ({
    tweet: {
      tweet_id: id,
      account_id: 'a',
      username: 'u',
      account_display_name: 'U',
      created_at: '2026-11-18T00:00:00Z',
      full_text: `Offering design help for small nonprofits ${id}`,
    } as never,
    threadTree: null,
    quotingTweets: [],
    quotingTweetCount: 0,
  }))
  jest
    .mocked(getTweetPageSummary)
    .mockResolvedValue({ title: 'T', description: 'D' })
})

const key = (id: string) => `tweet:${id}-${id}:1`
const notice = (
  id: string,
  hoursAgo: number,
  text = 'Offering design help for small nonprofits',
) =>
  ({
    tweet_id: id,
    posted_at: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
    preview_text: text,
    title: null,
  }) as unknown as Notice

test('reads eligible stored titles by tweet ID, in bounded chunks', async () => {
  rows = [
    { subject_key: key('1'), title: 'Design help on offer', eligible: true },
    { subject_key: key('2'), title: null, eligible: false },
  ]
  const ids = Array.from({ length: 160 }, (_, i) => String(i + 1))
  const titles = await readBulletinTitles(ids)
  expect(Array.from(titles)).toEqual([['1', 'Design help on offer']])
  expect(queries.map((q) => q.keys.length)).toEqual([150, 10])
})

test('a failed read leaves cards untitled instead of failing the board', async () => {
  readError = { message: 'relation does not exist' }
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  await expect(readBulletinTitles(['1'])).resolves.toEqual(new Map())
})

test('generates the newest missing titles once, skipping thin text and stored outcomes', async () => {
  rows = [{ subject_key: key('2'), title: null, eligible: false }]
  const result = await generateBulletinTitles(
    [
      notice('1', 30),
      notice('2', 1), // judged ineligible before: not asked again
      notice('3', 2),
      notice('4', 3, 'lol'), // too little text to summarize
      { ...notice('5', 1), title: 'Already titled' },
      notice('6', 40),
    ],
    { limit: 2 },
  )
  expect(jest.mocked(getTweetPageData).mock.calls.map(([id]) => id)).toEqual([
    '3',
    '1',
  ])
  expect(getTweetPageSummary).toHaveBeenCalledWith(
    expect.objectContaining({ key: key('3') }),
    true,
  )
  expect(result).toEqual({
    candidates: 3,
    attempted: 2,
    titled: 2,
    untitled: 0,
    failed: 0,
    remaining: 1,
  })
})

test('stored notices without checked text use their summary', async () => {
  const stored = {
    ...notice('7', 1),
    preview_text: undefined,
    summary: 'Offering design help for small nonprofits',
  }
  const result = await generateBulletinTitles([
    stored,
    { ...stored, tweet_id: '8', summary: 'ok' },
  ])
  expect(result).toMatchObject({ candidates: 1, attempted: 1 })
})
