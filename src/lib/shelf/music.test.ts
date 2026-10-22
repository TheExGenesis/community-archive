import { musicSleeves, musicSource, musicTracks, musicYears } from './music'
import { mapShelfRow, type ShelfDbRow } from './shape'
import type { ShelfItem } from './types'

const key = (value: string) => `k${value}`.padEnd(32, '0').slice(0, 32)
// A tweet id for a moment, as Twitter mints them (ms since its epoch, shifted 22 bits).
const idAt = (iso: string, n = 0) =>
  (
    (BigInt(Date.parse(iso) - 1288834974657) << BigInt(22)) +
    BigInt(n)
  ).toString()
let n = 0
const album = (overrides: Partial<ShelfDbRow> = {}): ShelfItem => {
  n += 1
  return mapShelfRow(
    '42',
    {
      work_key: `name:album${n}`,
      shelf_row: 'listening',
      medium: 'listening',
      label: `Album ${n}`,
      needs_title: false,
      creator: null,
      url: null,
      marks: [],
      evidence_tweet_ids: [idAt('2020-01-01T00:00:00Z', n)],
      first_at: '2020-01-01T00:00:00Z',
      last_at: '2020-01-01T00:00:00Z',
      image_url: null,
      image_source: null,
      status: 'approved',
      computed_at: '2026-10-22T00:00:00Z',
      echo_account_ids: [],
      format: 'music',
      ...overrides,
    },
    key,
  )!
}
const tweetsIn = (...years: number[]) =>
  years.map((y, i) => idAt(`${y}-06-01T00:00:00Z`, i))

describe('musicSleeves', () => {
  it('takes the works the member came back to most, a cover breaking ties', () => {
    const loved = album({ marks: ['loved', 'recommended'] })
    const often = album({
      evidence_tweet_ids: tweetsIn(2018, 2019, 2020, 2021),
    })
    const covered = album({
      evidence_tweet_ids: tweetsIn(2019, 2020, 2021),
      image_url: 'https://i.scdn.co/image/a',
      image_source: 'spotify',
    })
    const plain = album({ evidence_tweet_ids: tweetsIn(2017, 2018, 2019) })
    const once = album()
    // often and loved weigh 4 (often tweeted last); covered and plain weigh 3, the cover first.
    expect(
      musicSleeves([once, plain, covered, often, loved]).map((a) => a.label),
    ).toEqual([often.label, loved.label, covered.label, plain.label])
  })

  it('shows no sleeves when fewer than three qualify', () => {
    expect(
      musicSleeves([
        album({ marks: ['loved', 'recommended'] }),
        album(),
        album(),
      ]),
    ).toEqual([])
  })
})

describe('musicTracks', () => {
  it('lists the rest, most tweeted first or latest first', () => {
    const old = album({ evidence_tweet_ids: tweetsIn(2015, 2016) })
    const recent = album({ evidence_tweet_ids: tweetsIn(2024) })
    const sleeve = album({ evidence_tweet_ids: tweetsIn(2019, 2020, 2021) })
    expect(musicTracks([recent, old, sleeve], [sleeve], 'most')).toEqual([
      old,
      recent,
    ])
    expect(musicTracks([old, recent, sleeve], [sleeve], 'latest')).toEqual([
      recent,
      old,
    ])
  })
})

describe('musicYears', () => {
  it('gives one year or the span of the tweets', () => {
    expect(musicYears(album({ evidence_tweet_ids: tweetsIn(2019) }))).toBe(
      '2019',
    )
    expect(
      musicYears(album({ evidence_tweet_ids: tweetsIn(2016, 2023, 2019) })),
    ).toBe('2016–2023')
  })
})

describe('musicSource', () => {
  it('names where a link plays', () => {
    expect(musicSource('https://youtu.be/h_V2ccs_Urk')).toBe('YouTube')
    expect(musicSource('https://music.youtube.com/watch?v=x')).toBe('YouTube')
    expect(musicSource('https://open.spotify.com/track/1')).toBe('Spotify')
    expect(musicSource('https://gnuboicavalo.bandcamp.com/album/saxo')).toBe(
      'Bandcamp',
    )
    expect(musicSource('https://example.com/song')).toBeNull()
    expect(musicSource(null)).toBeNull()
  })
})
