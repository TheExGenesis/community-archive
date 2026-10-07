import {
  matchDigestStories,
  type DigestSearchEntry,
} from './relatedContentMatch'

const story = (
  slug: string,
  digestDate: string,
  fields: Partial<DigestSearchEntry> = {},
): DigestSearchEntry => ({
  digestDate,
  publishedDate: digestDate,
  slug,
  title: 'Untitled',
  subtitle: '',
  category: null,
  keyword: '',
  notes: '',
  posts: '',
  ...fields,
})

describe('matchDigestStories', () => {
  it('ranks title matches over copy and quoted posts, newest first within a rank', () => {
    const entries = [
      story('quoted', '2026-10-05', { posts: 'my Vibetober recap' }),
      story('older-title', '2026-09-01', { title: 'Vibetober returns' }),
      story('newer-title', '2026-10-01', { title: 'Vibetober, week one' }),
      story('subtitle', '2026-10-06', { subtitle: 'Why vibetober caught on' }),
      story('unrelated', '2026-10-07', { title: 'Something else' }),
    ]

    expect(
      matchDigestStories(entries, 'vibetober').map((entry) => entry.slug),
    ).toEqual(['newer-title', 'older-title', 'subtitle', 'quoted'])
  })

  it('matches at word starts so short queries do not hit inside words', () => {
    const entries = [
      story('inside', '2026-10-01', { title: 'She said it again' }),
      story('word', '2026-10-02', { title: 'AI labs ship models' }),
    ]

    expect(
      matchDigestStories(entries, 'ai').map((entry) => entry.slug),
    ).toEqual(['word'])
  })

  it('falls back to every word of a phrase appearing in the story copy', () => {
    const entries = [
      story('phrase', '2026-09-01', { notes: 'a note on open source models' }),
      story('words', '2026-10-01', {
        title: 'Source code leaks',
        subtitle: 'An open letter',
      }),
      story('posts-only', '2026-10-02', {
        posts: 'open thread, source unknown',
      }),
    ]

    expect(
      matchDigestStories(entries, 'open source').map((entry) => entry.slug),
    ).toEqual(['phrase', 'words'])
  })

  it('ignores empty and single-character queries and escapes regex syntax', () => {
    const entries = [story('c', '2026-10-01', { title: 'C++ (again)' })]

    expect(matchDigestStories(entries, ' ')).toEqual([])
    expect(matchDigestStories(entries, 'c')).toEqual([])
    expect(matchDigestStories(entries, 'c++ (')).toHaveLength(1)
  })
})
