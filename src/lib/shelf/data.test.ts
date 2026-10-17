import {
  findShelfRow,
  getPublicShelf,
  getShelfEvidence,
  shelfCoverKey,
  SHELF_EVIDENCE_LIMIT,
} from './data'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { isLoopbackUrl } from './access'
import type { TweetData } from '@/lib/tweets/types'

jest.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
  getServerSupabaseUrl: jest.fn(),
}))
jest.mock('@/lib/clickhouseTweetPage', () => ({
  fetchClickHouseTweetPageData: jest.fn(),
}))
jest.mock('@/lib/authenticatedAccount', () => ({
  getAuthenticatedAccountId: jest.fn(),
}))
jest.mock('@/lib/localAdminPreview', () => ({
  getLocalAdminPreview: jest.fn(),
}))

const tweet = (id: string, accountId = '42') =>
  ({
    tweet_id: id,
    account_id: accountId,
    username: 'reader',
    account_display_name: 'Reader',
    avatar_media_url: null,
    full_text: `tweet ${id}`,
    created_at: '2024-01-01T00:00:00Z',
    favorite_count: 3,
    retweet_count: null,
    media: [],
    quoted_tweet: null,
  }) as unknown as TweetData

describe('getShelfEvidence', () => {
  it('hydrates newest first, bounded, and only the owner’s tweets', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => String(100 + i))
    const fetchTweet = jest.fn(async (id: string) =>
      tweet(id, id === '119' ? '7' : '42'),
    )
    const result = await getShelfEvidence('42', [...ids, 'bad'], fetchTweet)
    expect(fetchTweet).toHaveBeenCalledTimes(SHELF_EVIDENCE_LIMIT)
    expect(fetchTweet.mock.calls[0][0]).toBe('119')
    expect(result.tweets.map((t) => t.id)[0]).toBe('118')
    expect(result.tweets).toHaveLength(SHELF_EVIDENCE_LIMIT - 1)
    expect(result.tweets[0]).toMatchObject({ text: 'tweet 118', rts: 0 })
    expect(result.failed).toBe(false)
  })

  it('skips individual failures but reports a total outage', async () => {
    let calls = 0
    const flaky = jest.fn(async (id: string) => {
      calls += 1
      if (calls === 1) throw new Error('timeout')
      return tweet(id)
    })
    const partial = await getShelfEvidence('42', ['1', '2'], flaky)
    expect(partial).toMatchObject({ failed: false, total: 2 })
    expect(partial.tweets).toHaveLength(1)
    const down = await getShelfEvidence(
      '42',
      ['1', '2'],
      jest.fn().mockRejectedValue(new Error('down')),
    )
    expect(down.failed).toBe(true)
  })
})

describe('isLoopbackUrl', () => {
  it('accepts only loopback hosts', () => {
    expect(isLoopbackUrl('http://127.0.0.1:54321')).toBe(true)
    expect(isLoopbackUrl('http://localhost:54321')).toBe(true)
    expect(isLoopbackUrl('https://abc.supabase.co')).toBe(false)
    expect(isLoopbackUrl('http://127.0.0.1.evil.test')).toBe(false)
    expect(isLoopbackUrl(undefined)).toBe(false)
    expect(isLoopbackUrl('not a url')).toBe(false)
  })
})

describe('public reads', () => {
  const rpcRow = (work_key: string, status: string) => ({
    work_key,
    shelf_row: 'books',
    medium: 'book',
    label: work_key,
    needs_title: false,
    creator: null,
    url: null,
    marks: [],
    evidence_tweet_ids: ['1'],
    first_at: '2020-01-01T00:00:00Z',
    last_at: '2020-01-01T00:00:00Z',
    image_url: null,
    image_source: null,
    status,
    computed_at: '2020-01-01T00:00:00Z',
  })
  const rpc = jest.fn()
  beforeEach(() => {
    rpc.mockReset()
    jest.mocked(createServerServiceRoleClient).mockReturnValue({ rpc } as never)
  })

  it('never publishes changed, pending or hidden items', async () => {
    rpc.mockResolvedValue({
      data: [
        rpcRow('book:ok', 'approved'),
        rpcRow('book:changed', 'changed'),
        rpcRow('book:pending', 'pending'),
      ],
      error: null,
    })
    const shelf = await getPublicShelf('42')
    expect(rpc).toHaveBeenCalledWith('get_shelf', {
      p_account_id: '42',
      include_unapproved: false,
    })
    expect(shelf.rows[0].items.map((item) => item.workKey)).toEqual(['book:ok'])
    const owner = jest.fn().mockResolvedValue(false)
    expect(
      await findShelfRow('42', shelfCoverKey('book:changed'), owner),
    ).toBeNull()
    expect(owner).toHaveBeenCalled()
  })

  it('serves owner-only items only after the owner check passes', async () => {
    rpc.mockImplementation(async (_name, args) => ({
      data: args.include_unapproved ? [rpcRow('book:changed', 'changed')] : [],
      error: null,
    }))
    const found = await findShelfRow(
      '42',
      shelfCoverKey('book:changed'),
      async () => true,
    )
    expect(found).toMatchObject({ isPublic: false })
  })

  it('throws instead of returning an empty shelf when the read fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    await expect(getPublicShelf('42')).rejects.toThrow(
      'Shelf could not be loaded',
    )
  })
})
