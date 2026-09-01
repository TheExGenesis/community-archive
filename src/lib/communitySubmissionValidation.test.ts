import {
  COMMUNITY_COVER_MAX_BYTES,
  communityProjectSlug,
  validateCommunitySubmission,
} from './communitySubmissionValidation'

const validFormData = () => {
  const formData = new FormData()
  formData.set('projectName', 'Archive Quilt')
  formData.set('projectUrl', 'https://example.org/archive-quilt')
  formData.set('creatorName', 'Ada')
  formData.set('creatorHandle', '@Ada_Builds')
  formData.set('category', 'Experiments')
  formData.set('description', 'A visual map of recurring conversations.')
  formData.set(
    'archiveUse',
    'It groups public posts into visual conversation clusters.',
  )
  formData.set('sourcePost', 'https://x.com/ada/status/1234567890')
  formData.set('tags', 'visualization, archive, visualization')
  return formData
}

describe('community submission validation', () => {
  it('normalizes a valid submission', () => {
    const result = validateCommunitySubmission(validFormData())

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        creatorHandle: 'ada_builds',
        category: 'Experiments',
        sourceTweetId: '1234567890',
        tags: ['visualization', 'archive'],
      }),
    })
  })

  it('rejects non-HTTPS project URLs', () => {
    const formData = validFormData()
    formData.set('projectUrl', 'http://example.org/archive-quilt')

    expect(validateCommunitySubmission(formData)).toEqual({
      ok: false,
      error: 'Project URL must be a valid HTTPS URL.',
    })
  })

  it('requires a real X post URL as evidence', () => {
    const formData = validFormData()
    formData.set('sourcePost', 'https://example.org/status/1234567890')

    expect(validateCommunitySubmission(formData)).toEqual({
      ok: false,
      error: 'Launch/source post must be an X post URL.',
    })
  })

  it('rejects oversized covers', () => {
    const formData = validFormData()
    formData.set(
      'cover',
      new File([new Uint8Array(COMMUNITY_COVER_MAX_BYTES + 1)], 'cover.png', {
        type: 'image/png',
      }),
    )

    expect(validateCommunitySubmission(formData)).toEqual({
      ok: false,
      error: 'Cover image must be 5MB or smaller.',
    })
  })

  it('creates stable URL-safe slugs with an ID suffix', () => {
    expect(
      communityProjectSlug('New Words & Their Pioneers!', '12345678-abcd'),
    ).toBe('new-words-their-pioneers-12345678')
  })
})
