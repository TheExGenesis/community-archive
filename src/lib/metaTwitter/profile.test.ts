const resolveAccountIdMock = jest.fn()
const getCachedProfileHeaderMock = jest.fn()
const getClickHouseUserProfileMock = jest.fn()

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

import { resolveProfile } from './profile'

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
  avatar_media_url:
    'https://pbs.twimg.com/profile_images/7/archived_normal.jpg',
  header_media_url: 'https://pbs.twimg.com/profile_banners/7/7',
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

test('backfills a missing archive avatar from the analytical profile', async () => {
  resolveAccountIdMock.mockResolvedValue('42')
  getCachedProfileHeaderMock.mockResolvedValue({
    ...archivedProfile,
    avatar_media_url: null,
    header_media_url: '',
  })
  getClickHouseUserProfileMock.mockResolvedValue({
    user: {
      ...archivedProfile,
      avatar_media_url: 'https://pbs.twimg.com/profile_images/1/a_normal.jpg',
      header_media_url: 'https://pbs.twimg.com/profile_banners/1/2',
    },
    topTweets: [],
  })

  await expect(resolveProfile('alice')).resolves.toMatchObject({
    profile: {
      avatar_media_url: 'https://pbs.twimg.com/profile_images/1/a_normal.jpg',
      header_media_url: 'https://pbs.twimg.com/profile_banners/1/2',
    },
  })
})

test('keeps the archived media and skips the analytical lookup when both are present', async () => {
  resolveAccountIdMock.mockResolvedValue('42')
  getCachedProfileHeaderMock.mockResolvedValue({
    ...archivedProfile,
    avatar_media_url: 'https://pbs.twimg.com/profile_images/9/archived.jpg',
    header_media_url: 'https://pbs.twimg.com/profile_banners/9/9',
  })

  await expect(resolveProfile('alice')).resolves.toMatchObject({
    profile: {
      avatar_media_url: 'https://pbs.twimg.com/profile_images/9/archived.jpg',
    },
  })
  expect(getClickHouseUserProfileMock).not.toHaveBeenCalled()
})

test('leaves media null when neither source has it', async () => {
  resolveAccountIdMock.mockResolvedValue('42')
  getCachedProfileHeaderMock.mockResolvedValue({
    ...archivedProfile,
    avatar_media_url: '   ',
    header_media_url: null,
  })
  getClickHouseUserProfileMock.mockResolvedValue(null)

  await expect(resolveProfile('alice')).resolves.toMatchObject({
    profile: { avatar_media_url: null, header_media_url: null },
  })
})

test('strips the archive prefix before the analytical lookup', async () => {
  resolveAccountIdMock.mockResolvedValue('42')
  getCachedProfileHeaderMock.mockResolvedValue({
    ...archivedProfile,
    avatar_media_url: null,
  })
  getClickHouseUserProfileMock.mockResolvedValue(null)

  await resolveProfile('archive%3Aalice')
  expect(getClickHouseUserProfileMock).toHaveBeenCalledWith('alice')
})
