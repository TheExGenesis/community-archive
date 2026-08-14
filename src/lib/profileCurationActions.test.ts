import {
  mutateProfileCuration,
  updateDownloadArchiveVisibility,
} from '@/app/user/[account_id]/actions'

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

describe('owner profile server actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpsert.mockResolvedValue({ error: null })
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
})
