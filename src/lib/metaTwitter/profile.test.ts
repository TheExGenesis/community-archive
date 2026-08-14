const resolveAccountIdMock = jest.fn()
const getCachedProfileHeaderMock = jest.fn()
const getClickHouseUserProfileMock = jest.fn()
const getProfileBangersMock = jest.fn()

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (callback: unknown) => callback,
}))

jest.mock('@/lib/metaTwitter/data', () => ({
  resolveAccountId: (...args: unknown[]) => resolveAccountIdMock(...args),
  getCachedProfileHeader: (...args: unknown[]) =>
    getCachedProfileHeaderMock(...args),
}))

jest.mock('@/lib/clickhouseUserProfile', () => ({
  getClickHouseUserProfile: (...args: unknown[]) =>
    getClickHouseUserProfileMock(...args),
}))

jest.mock('@/lib/metaTwitter/bangers', () => ({
  getProfileBangers: (...args: unknown[]) => getProfileBangersMock(...args),
}))

import { getProfilePreviewStats, resolveProfile } from './profile'

const archivedProfile = {
  account_id: '42',
  username: 'alice',
  account_display_name: 'Alice',
  created_at: null,
  num_tweets: 10,
  num_followers: 20,
  num_following: 30,
  num_likes: 40,
  has_archive: true,
  is_opted_in: false,
  bio: 'Archived profile',
  website: null,
  location: null,
  avatar_media_url: null,
  header_media_url: null,
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('prefers the authoritative archived profile', async () => {
  resolveAccountIdMock.mockResolvedValue('42')
  getCachedProfileHeaderMock.mockResolvedValue(archivedProfile)

  await expect(resolveProfile('alice')).resolves.toEqual({
    accountId: '42',
    profile: archivedProfile,
  })
  expect(getClickHouseUserProfileMock).not.toHaveBeenCalled()
})

test('maps the analytical fallback to the shared profile shape', async () => {
  resolveAccountIdMock.mockResolvedValue(null)
  getClickHouseUserProfileMock.mockResolvedValue({
    user: {
      ...archivedProfile,
      account_id: '77',
      username: 'bob',
      account_display_name: 'Bob',
      has_archive: false,
      is_opted_in: false,
      bio: 'Analytical profile',
      header_media_url: undefined,
    },
    topTweets: [],
  })

  await expect(resolveProfile('bob')).resolves.toMatchObject({
    accountId: '77',
    profile: {
      account_id: '77',
      username: 'bob',
      account_display_name: 'Bob',
      bio: 'Analytical profile',
      header_media_url: null,
    },
  })
})

test('returns null when neither profile source can resolve the user', async () => {
  resolveAccountIdMock.mockResolvedValue(null)
  getClickHouseUserProfileMock.mockResolvedValue(null)

  await expect(resolveProfile('missing')).resolves.toBeNull()
})

test('summarizes the profile collection for the preview card', async () => {
  getProfileBangersMock.mockResolvedValue({
    available: true,
    total: 3,
    yearCounts: [
      { year: 2024, count: 2 },
      { year: 2023, count: 1 },
    ],
    tweets: [{ quote_count: 5 }, { quote_count: 8 }, { quote_count: 2 }],
  })

  await expect(getProfilePreviewStats('42')).resolves.toEqual({
    archivedQuotes: 15,
    bangers: 3,
    yearsArchived: 2,
  })
})

test('omits preview stats when the analytical collection is unavailable', async () => {
  getProfileBangersMock.mockResolvedValue({
    available: false,
    total: 0,
    yearCounts: [],
    tweets: [],
  })

  await expect(getProfilePreviewStats('42')).resolves.toBeNull()
})
