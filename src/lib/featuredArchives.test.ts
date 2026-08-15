import {
  FEATURED_ARCHIVE_GROUPS,
  HOMEPAGE_FEATURED_ARCHIVE_COUNT,
  sampleFeaturedArchives,
} from './featuredArchives'

describe('sampleFeaturedArchives', () => {
  it('samples one complete profile from each editorial group', () => {
    const sample = sampleFeaturedArchives(() => 0.5)

    expect(sample).toHaveLength(HOMEPAGE_FEATURED_ARCHIVE_COUNT)
    expect(new Set(sample.map((archive) => archive.account_id)).size).toBe(
      HOMEPAGE_FEATURED_ARCHIVE_COUNT,
    )
    expect(sample.every((archive) => archive.avatar_media_url)).toBe(true)
    expect(
      sample.every(
        (archive) =>
          typeof archive.num_tweets === 'number' && archive.num_tweets > 0,
      ),
    ).toBe(true)

    for (const group of FEATURED_ARCHIVE_GROUPS) {
      expect(
        sample.filter((archive) =>
          group.some(
            (candidate) => candidate.account_id === archive.account_id,
          ),
        ),
      ).toHaveLength(1)
    }
  })

  it('keeps the requested anchors in the 24-person candidate pool', () => {
    const usernames = FEATURED_ARCHIVE_GROUPS.flat().map(
      (archive) => archive.username,
    )

    expect(usernames).toEqual(
      expect.arrayContaining([
        'tszzl',
        'visakanv',
        'patio11',
        'repligate',
        'eshear',
        'algekalipso',
        'davidad',
        'nosilverv',
      ]),
    )
    expect(usernames).not.toContain('tessera_antra')
  })
})
