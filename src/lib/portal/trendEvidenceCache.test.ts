import {
  MAX_TREND_EVIDENCE_CACHE_ENTRIES,
  cachedTrendEvidence,
  hasCompleteTrendEvidence,
  storeTrendEvidence,
  trendEvidenceNextOffset,
} from './trendEvidenceCache'
import type { PortalTweet } from './types'

function tweet(id: string, createdAt: string): PortalTweet {
  return {
    id,
    username: 'alice',
    name: 'Alice',
    avatar: null,
    text: id,
    observedAt: createdAt,
    createdAt,
    likes: 0,
    rts: 0,
  }
}

describe('trend evidence cache', () => {
  test('merges per-term and per-range results without duplicate tweets', () => {
    const cache = new Map()
    storeTrendEvidence(cache, {
      term: 'tpot',
      range: null,
      tweets: [
        tweet('3', '2026-01-01T00:00:00.000Z'),
        tweet('1', '2024-01-01T00:00:00.000Z'),
      ],
    })
    storeTrendEvidence(cache, {
      term: 'tpot',
      range: { since: '2024-01-01', until: '2025-01-01' },
      tweets: [
        tweet('2', '2024-12-01T00:00:00.000Z'),
        tweet('1', '2024-01-01T00:00:00.000Z'),
      ],
    })
    storeTrendEvidence(cache, {
      term: 'postrat',
      range: null,
      tweets: [tweet('4', '2024-06-01T00:00:00.000Z')],
    })

    expect(
      cachedTrendEvidence(cache, ['tpot'], {
        since: '2024-01-01',
        until: '2025-01-01',
      }).map(({ id }) => id),
    ).toEqual(['2', '1'])
    expect(
      cachedTrendEvidence(cache, ['tpot', 'postrat'], null).map(({ id }) => id),
    ).toEqual(['3', '2', '4', '1'])
  })

  test('bounds stored combinations with least-recently-used insertion order', () => {
    const cache = new Map()
    for (let index = 0; index <= MAX_TREND_EVIDENCE_CACHE_ENTRIES; index += 1) {
      storeTrendEvidence(cache, {
        term: `term-${index}`,
        range: null,
        tweets: [],
      })
    }

    expect(cache.size).toBe(MAX_TREND_EVIDENCE_CACHE_ENTRIES)
    expect(Array.from(cache.values())[0].term).toBe('term-1')
  })

  test('requires an exact range page so selected periods remain pageable', () => {
    const cache = new Map()
    storeTrendEvidence(cache, {
      term: 'tpot',
      range: null,
      tweets: Array.from({ length: 30 }, (_, index) =>
        tweet(
          String(index),
          `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        ),
      ),
    })

    expect(
      hasCompleteTrendEvidence(cache, 'tpot', {
        since: '2026-01-01',
        until: '2027-01-01',
      }),
    ).toBe(false)
    expect(
      hasCompleteTrendEvidence(cache, 'tpot', {
        since: '2025-01-01',
        until: '2026-01-01',
      }),
    ).toBe(false)
    expect(hasCompleteTrendEvidence(cache, 'tpot', null)).toBe(true)
  })

  test('appends pages and keeps oldest-first evidence separate', () => {
    const cache = new Map()
    storeTrendEvidence(cache, {
      term: 'tpot',
      range: null,
      sort: 'oldest',
      tweets: [tweet('1', '2024-01-01T00:00:00.000Z')],
      nextOffset: 1,
    })
    storeTrendEvidence(
      cache,
      {
        term: 'tpot',
        range: null,
        sort: 'oldest',
        tweets: [tweet('2', '2025-01-01T00:00:00.000Z')],
        nextOffset: null,
      },
      { append: true },
    )

    expect(
      cachedTrendEvidence(cache, ['tpot'], null, 'oldest').map(({ id }) => id),
    ).toEqual(['1', '2'])
    expect(cachedTrendEvidence(cache, ['tpot'], null, 'newest')).toEqual([])
    expect(trendEvidenceNextOffset(cache, 'tpot', null, 'oldest')).toBeNull()
  })
})
