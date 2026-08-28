const resolvePublicProfileIdentityMock = jest.fn()
const getCachedProfileHeaderMock = jest.fn()
const getClickHouseUserProfileMock = jest.fn()

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (callback: unknown) => callback,
}))

jest.mock('@/lib/metaTwitter/data', () => ({
  resolvePublicProfileIdentity: (...args: unknown[]) =>
    resolvePublicProfileIdentityMock(...args),
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
  resolvePublicProfileIdentityMock.mockResolvedValue({
    accountId: '42',
    username: 'alice',
  })
  getCachedProfileHeaderMock.mockResolvedValue(archivedProfile)

  await expect(resolveProfile('alice')).resolves.toEqual({
    accountId: '42',
    profile: archivedProfile,
  })
  expect(getClickHouseUserProfileMock).not.toHaveBeenCalled()
})

test('maps the analytical fallback to the shared profile shape', async () => {
  resolvePublicProfileIdentityMock.mockResolvedValue({
    accountId: null,
    username: 'bob',
  })
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

test('does not load profile sources when the public policy identity is hidden', async () => {
  resolvePublicProfileIdentityMock.mockResolvedValue(null)

  await expect(resolveProfile('missing')).resolves.toBeNull()
  expect(getCachedProfileHeaderMock).not.toHaveBeenCalled()
  expect(getClickHouseUserProfileMock).not.toHaveBeenCalled()
})

test('backfills a missing archive avatar from the analytical profile', async () => {
  resolvePublicProfileIdentityMock.mockResolvedValue({
    accountId: '42',
    username: 'alice',
  })
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
  resolvePublicProfileIdentityMock.mockResolvedValue({
    accountId: '42',
    username: 'alice',
  })
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
  resolvePublicProfileIdentityMock.mockResolvedValue({
    accountId: '42',
    username: 'alice',
  })
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

test('uses the policy-approved account ID for the analytical lookup', async () => {
  resolvePublicProfileIdentityMock.mockResolvedValue({
    accountId: '42',
    username: 'alice',
  })
  getCachedProfileHeaderMock.mockResolvedValue({
    ...archivedProfile,
    avatar_media_url: null,
  })
  getClickHouseUserProfileMock.mockResolvedValue(null)

  await resolveProfile('archive%3Aalice')
  expect(getClickHouseUserProfileMock).toHaveBeenCalledWith('42')
})
