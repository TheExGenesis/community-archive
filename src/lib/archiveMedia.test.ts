import { getArchiveTweetMedia } from './archiveMedia'

describe('getArchiveTweetMedia', () => {
  it('uses the complete extended collection for a multi-image tweet', () => {
    const media = getArchiveTweetMedia({
      entities: { media: [{ id_str: '1' }] },
      extended_entities: {
        media: [
          { id_str: '1' },
          { id_str: '2' },
          { id_str: '3' },
          { id_str: '4' },
        ],
      },
    })

    expect(media.map((item) => item.id_str)).toEqual(['1', '2', '3', '4'])
  })

  it('falls back to entities media for older archive records', () => {
    expect(
      getArchiveTweetMedia({ entities: { media: [{ id_str: '1' }] } }),
    ).toHaveLength(1)
  })

  it('returns an empty collection when a tweet has no media', () => {
    expect(getArchiveTweetMedia({})).toEqual([])
  })
})
