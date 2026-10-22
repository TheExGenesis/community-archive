const resolvePublicProfileIdentityMock = jest.fn()
const getCachedProfileHeaderMock = jest.fn()
const getClickHouseUserProfileMock = jest.fn()
const isPolicyBlockedAccountMock = jest.fn()

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (callback: unknown) => callback,
}))

jest.mock('@/lib/metaTwitter/data', () => ({
  resolvePublicProfileIdentity: (...args: unknown[]) =>
    resolvePublicProfileIdentityMock(...args),
  getCachedProfileHeader: (...args: unknown[]) =>
    getCachedProfileHeaderMock(...args),
  isPolicyBlockedAccount: (...args: unknown[]) =>
    isPolicyBlockedAccountMock(...args),
}))

jest.mock('@/lib/clickhouseUserProfile', () => ({
  getClickHouseUserProfile: (...args: unknown[]) =>
    getClickHouseUserProfileMock(...args),
}))

import { resolveProfile, resolveProfileCore } from './profile'

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
    isMember: true,
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
    isMember: true,
    profile: {
      account_id: '77',
      username: 'bob',
      account_display_name: 'Bob',
      bio: 'Analytical profile',
      header_media_url: null,
    },
  })
})

const outsideProfile = {
  user: {
    ...archivedProfile,
    account_id: '77',
    username: 'Bob',
    account_display_name: 'Bob',
    has_archive: false,
    is_opted_in: false,
  },
  topTweets: [],
}

test('serves an account outside the directory from the analytical corpus', async () => {
  resolvePublicProfileIdentityMock.mockResolvedValue(null)
  getClickHouseUserProfileMock.mockResolvedValue(outsideProfile)
  isPolicyBlockedAccountMock.mockResolvedValue(false)

  await expect(resolveProfileCore('BOB')).resolves.toMatchObject({
    accountId: '77',
    isMember: false,
    profile: { username: 'Bob', has_archive: false, is_opted_in: false },
  })
  expect(getCachedProfileHeaderMock).not.toHaveBeenCalled()
  expect(getClickHouseUserProfileMock.mock.calls).toEqual([['bob']])
  expect(isPolicyBlockedAccountMock.mock.calls).toEqual([['77', 'Bob']])
})

test('hides an opted-out account outside the directory', async () => {
  resolvePublicProfileIdentityMock.mockResolvedValue(null)
  getClickHouseUserProfileMock.mockResolvedValue(outsideProfile)
  isPolicyBlockedAccountMock.mockResolvedValue(true)

  await expect(resolveProfileCore('77')).resolves.toBeNull()
  expect(isPolicyBlockedAccountMock).toHaveBeenCalledWith('77', 'Bob')
})

test('treats a member found only by stable ID as a member', async () => {
  resolvePublicProfileIdentityMock.mockImplementation(async (param: string) =>
    param === '77' ? { accountId: '77', username: 'oldbob' } : null,
  )
  getClickHouseUserProfileMock.mockResolvedValue(outsideProfile)
  getCachedProfileHeaderMock.mockResolvedValue({
    ...archivedProfile,
    account_id: '77',
    username: 'oldbob',
  })

  await expect(resolveProfileCore('bob')).resolves.toMatchObject({
    accountId: '77',
    isMember: true,
    profile: { username: 'oldbob', has_archive: true },
  })
})

test('ignores a failed policy read for a member found by stable ID', async () => {
  resolvePublicProfileIdentityMock.mockImplementation(async (param: string) =>
    param === '77' ? { accountId: '77', username: 'oldbob' } : null,
  )
  getClickHouseUserProfileMock.mockResolvedValue(outsideProfile)
  isPolicyBlockedAccountMock.mockRejectedValue(new Error('policy unavailable'))
  getCachedProfileHeaderMock.mockResolvedValue({
    ...archivedProfile,
    account_id: '77',
    username: 'oldbob',
  })

  await expect(resolveProfileCore('bob')).resolves.toMatchObject({
    accountId: '77',
    isMember: true,
  })
})

test('does not render an account outside the directory when the policy read fails', async () => {
  resolvePublicProfileIdentityMock.mockResolvedValue(null)
  getClickHouseUserProfileMock.mockResolvedValue(outsideProfile)
  isPolicyBlockedAccountMock.mockRejectedValue(new Error('policy unavailable'))

  await expect(resolveProfileCore('bob')).rejects.toThrow('policy unavailable')
})

test('returns nothing for an unknown account or a malformed identifier', async () => {
  resolvePublicProfileIdentityMock.mockResolvedValue(null)
  getClickHouseUserProfileMock.mockResolvedValue(null)

  await expect(resolveProfile('missing')).resolves.toBeNull()
  await expect(resolveProfile('archive%3Aalice')).resolves.toBeNull()
  await expect(resolveProfile('%E0%A4%A')).resolves.toBeNull()
  expect(getClickHouseUserProfileMock.mock.calls).toEqual([['missing']])
  expect(isPolicyBlockedAccountMock).not.toHaveBeenCalled()
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
  expect(getClickHouseUserProfileMock).toHaveBeenCalledWith('42', {
    tweetLimit: 1,
  })
})

test('renders the core profile while optional media never settles', async () => {
  resolvePublicProfileIdentityMock.mockResolvedValue({
    accountId: '42',
    username: 'alice',
  })
  getCachedProfileHeaderMock.mockResolvedValue({
    ...archivedProfile,
    header_media_url: null,
  })
  getClickHouseUserProfileMock.mockReturnValue(new Promise(() => undefined))
  await expect(resolveProfileCore('alice')).resolves.toMatchObject({
    profile: { account_display_name: 'Alice', header_media_url: null },
  })
  expect(getClickHouseUserProfileMock).not.toHaveBeenCalled()
})
