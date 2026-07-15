import {
  buildSearchExpression,
  buildSearchHref,
  buildSearchParams,
  normalizeSearchParams,
  parseSearchExpression,
} from './searchParams'

describe('search parameter helpers', () => {
  it('separates supported filters from search terms', () => {
    expect(
      parseSearchExpression(
        'open source from:jack to:alice since:2020-01-01 until:2020-12-31',
      ),
    ).toEqual({
      options: {
        from: 'jack',
        to: 'alice',
        since: '2020-01-01',
        until: '2020-12-31',
      },
      words: ['open', 'source'],
    })
  })

  it('keeps unsupported or empty operators as search terms', () => {
    expect(parseSearchExpression('archive lang:en from:')).toEqual({
      options: {},
      words: ['archive', 'lang:en', 'from:'],
    })
  })

  it('maps an expression to the existing search URL convention', () => {
    expect(
      buildSearchParams('community from:alice since:2024-01-01').toString(),
    ).toBe('q=community&fromUser=alice&sinceDate=2024-01-01')
  })

  it('builds a filter-only search URL without treating the operator as text', () => {
    expect(buildSearchHref('from:a__musingcat')).toBe(
      '/search?fromUser=a__musingcat',
    )
  })

  it('reconstructs the editable expression from URL parameters', () => {
    expect(
      buildSearchExpression(
        new URLSearchParams({
          q: 'community archive',
          replyToUser: 'bob',
          untilDate: '2025-01-01',
        }),
      ),
    ).toBe('community archive to:bob until:2025-01-01')
  })

  it('normalizes inline and explicit URL filters to the same search', () => {
    const inlineFilter = normalizeSearchParams(
      new URLSearchParams('q=from%3Acuriousgustaf+perplexity'),
    )
    const explicitFilter = normalizeSearchParams(
      new URLSearchParams('q=perplexity&fromUser=curiousgustaf'),
    )

    expect(inlineFilter.toString()).toBe('q=perplexity&fromUser=curiousgustaf')
    expect(inlineFilter.toString()).toBe(explicitFilter.toString())
  })

  it('gives explicit URL filters precedence over inline filters', () => {
    expect(
      normalizeSearchParams(
        new URLSearchParams('q=from%3Abob+archive&fromUser=alice'),
      ).toString(),
    ).toBe('q=archive&fromUser=alice')
  })
})
