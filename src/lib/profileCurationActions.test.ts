import {
  addTweetToOwnProfile,
  mutateProfileCuration,
  updateDownloadArchiveVisibility,
} from '@/app/user/[account_id]/actions'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'

const mockGetUser = jest.fn()
const mockUpsert = jest.fn()
const mockFrom = jest.fn(() => ({ upsert: mockUpsert }))
const mockRevalidatePath = jest.fn()

jest.mock('next/headers', () => ({ cookies: jest.fn(async () => ({})) }))
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}))
jest.mock('@/utils/supabase', () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
  }),
  createServerServiceRoleClient: () => ({ from: mockFrom }),
}))
jest.mock('@/lib/clickhouseTweetPage', () => ({
  fetchClickHouseTweetPageData: jest.fn(),
}))

const mockFetchTweet = fetchClickHouseTweetPageData as jest.MockedFunction<
  typeof fetchClickHouseTweetPageData
>

describe('owner profile server actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpsert.mockResolvedValue({ error: null })
    mockFetchTweet.mockResolvedValue(null)
  })

  test('rejects a signed-in user editing another account before any write', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { app_metadata: { provider_id: '41' } } },
      error: null,
    })

    await expect(
      mutateProfileCuration({
        action: 'dismiss',
        accountId: '42',
        section: 'bangers',
        itemId: '100',
      }),
    ).rejects.toThrow('only edit your own profile')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  test('writes a sparse override for the authenticated owner', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { app_metadata: { provider_id: '42' } } },
      error: null,
    })

    await mutateProfileCuration({
      action: 'dismiss',
      accountId: '42',
      section: 'bangers',
      itemId: '100',
    })

    expect(mockFrom).toHaveBeenCalledWith('profile_curation')
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        account_id: '42',
        section: 'bangers',
        item_id: '100',
        is_hidden: true,
      },
      { onConflict: 'account_id,section,item_id' },
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/user/42')
  })

  test('restores only the requested hidden profile item', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { app_metadata: { provider_id: '42' } } },
      error: null,
    })

    await mutateProfileCuration({
      action: 'restore-item',
      accountId: '42',
      section: 'bangers',
      itemId: '100',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      {
        account_id: '42',
        section: 'bangers',
        item_id: '100',
        is_hidden: false,
      },
      { onConflict: 'account_id,section,item_id' },
    )
  })

  test('keeps Download Archive visible unless the owner turns it off', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { app_metadata: { provider_id: '42' } } },
      error: null,
    })

    await updateDownloadArchiveVisibility('42', false)

    expect(mockFrom).toHaveBeenCalledWith('profile_settings')
    expect(mockUpsert).toHaveBeenCalledWith(
      { account_id: '42', download_archive_visible: false },
      { onConflict: 'account_id' },
    )
  })

  test('adds an authenticated owners archived tweet as a featured profile item', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { app_metadata: { provider_id: '42' } } },
      error: null,
    })
    mockFetchTweet.mockResolvedValue({
      tweet_id: '100',
      account_id: '42',
    } as Awaited<ReturnType<typeof fetchClickHouseTweetPageData>>)

    await expect(addTweetToOwnProfile('100')).resolves.toEqual({
      ok: true,
      accountId: '42',
    })
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        account_id: '42',
        section: 'bangers',
        item_id: '100',
        is_hidden: false,
        is_featured: true,
        position: 0,
      },
      { onConflict: 'account_id,section,item_id' },
    )
  })

  test('rejects a tweet that belongs to another archived account', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { app_metadata: { provider_id: '42' } } },
      error: null,
    })
    mockFetchTweet.mockResolvedValue({
      tweet_id: '100',
      account_id: '41',
    } as Awaited<ReturnType<typeof fetchClickHouseTweetPageData>>)

    await expect(addTweetToOwnProfile('100')).rejects.toThrow(
      'only add your own tweets',
    )
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
