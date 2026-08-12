import { getHighResolutionAvatarUrl, getLatestAvatarMediaUrl } from './avatar'

describe('getHighResolutionAvatarUrl', () => {
  it('upgrades stored Twitter thumbnail suffixes', () => {
    expect(
      getHighResolutionAvatarUrl(
        'https://pbs.twimg.com/profile_images/123/avatar_normal.jpg',
      ),
    ).toBe('https://pbs.twimg.com/profile_images/123/avatar_400x400.jpg')
    expect(
      getHighResolutionAvatarUrl(
        'https://pbs.twimg.com/profile_images/123/avatar_200x200.png',
      ),
    ).toBe('https://pbs.twimg.com/profile_images/123/avatar_400x400.png')
  })

  it('upgrades a pbs.twimg.com query-size request', () => {
    expect(
      getHighResolutionAvatarUrl(
        'https://pbs.twimg.com/profile_images/123/avatar.jpg?name=small',
      ),
    ).toBe('https://pbs.twimg.com/profile_images/123/avatar.jpg?name=400x400')
  })

  it('leaves URLs without a known thumbnail marker unchanged', () => {
    expect(getHighResolutionAvatarUrl('https://example.com/avatar.jpg')).toBe(
      'https://example.com/avatar.jpg',
    )
    expect(getHighResolutionAvatarUrl(null)).toBeUndefined()
  })
})

describe('getLatestAvatarMediaUrl', () => {
  it('reads an embedded one-to-one profile object', () => {
    expect(
      getLatestAvatarMediaUrl({
        avatar_media_url: 'https://example.com/avatar.jpg',
      }),
    ).toBe('https://example.com/avatar.jpg')
  })

  it('selects the newest profile when PostgREST embeds an array', () => {
    expect(
      getLatestAvatarMediaUrl([
        {
          avatar_media_url: 'https://example.com/old.jpg',
          archive_upload_id: 10,
        },
        {
          avatar_media_url: 'https://example.com/new.jpg',
          archive_upload_id: 20,
        },
      ]),
    ).toBe('https://example.com/new.jpg')
  })

  it('uses the newest available image when the latest profile has none', () => {
    expect(
      getLatestAvatarMediaUrl([
        {
          avatar_media_url: 'https://example.com/available.jpg',
          archive_upload_id: 10,
        },
        {
          avatar_media_url: null,
          archive_upload_id: 20,
        },
      ]),
    ).toBe('https://example.com/available.jpg')
  })

  it('returns undefined when no profile image exists', () => {
    expect(getLatestAvatarMediaUrl(null)).toBeUndefined()
    expect(getLatestAvatarMediaUrl([])).toBeUndefined()
  })
})
