import {
  bentoTiles,
  inPeriod,
  pickFavourites,
  shelfStats,
  shelfWeight,
  shelfYears,
  tweetTime,
} from './bento'
import { shelfStatus, shelfVerb, youtubeId } from './labels'
import { groupShelf, mapShelfRow, type ShelfDbRow } from './shape'
import type { ShelfItem } from './types'

const key = (value: string) => `k${value}`.padEnd(32, '0').slice(0, 32)
let n = 0
const item = (overrides: Partial<ShelfDbRow> = {}): ShelfItem => {
  n += 1
  return mapShelfRow(
    '42',
    {
      work_key: `name:work${n}`,
      shelf_row: 'books',
      medium: 'books',
      label: `Work ${n}`,
      needs_title: false,
      creator: null,
      url: null,
      marks: [],
      evidence_tweet_ids: ['1'],
      first_at: '2020-01-01T00:00:00Z',
      last_at: '2021-01-01T00:00:00Z',
      image_url: null,
      image_source: null,
      status: 'approved',
      computed_at: '2026-10-08T00:00:00Z',
      echo_account_ids: [],
      ...overrides,
    },
    key,
  )!
}
const tweets = (count: number) =>
  Array.from({ length: count }, (_, i) => String(100 + i))

describe('shelfWeight', () => {
  it('counts tweets and weighs loved, recommended and disliked', () => {
    expect(shelfWeight(item({ evidence_tweet_ids: tweets(3) }))).toBe(3)
    expect(shelfWeight(item({ marks: ['loved', 'recommended'] }))).toBe(4)
    expect(shelfWeight(item({ marks: ['loved', 'disliked'] }))).toBe(1)
  })
})

describe('pickFavourites', () => {
  it('ranks by weight, caps two per medium and skips weak or unnamed works', () => {
    const books = [6, 5, 4].map((t) =>
      item({ label: `Book ${t}`, evidence_tweet_ids: tweets(t) }),
    )
    const video = item({
      shelf_row: 'watching',
      medium: 'watching',
      evidence_tweet_ids: tweets(4),
    })
    const weak = item({
      shelf_row: 'reading',
      medium: 'reading',
      marks: ['loved'],
    })
    const untitled = item({
      shelf_row: 'reading',
      needs_title: true,
      evidence_tweet_ids: tweets(9),
    })
    const site = item({
      shelf_row: 'reading',
      url: 'http://read-next.com',
      evidence_tweet_ids: tweets(9),
    })
    const handle = item({
      shelf_row: 'listening',
      label: 'curaffairs',
      evidence_tweet_ids: tweets(9),
    })
    const made = item({ shelf_row: 'made', evidence_tweet_ids: tweets(30) })
    const favourites = pickFavourites([
      ...books,
      video,
      weak,
      untitled,
      site,
      handle,
      made,
    ])
    expect(favourites.map((f) => f.label)).toEqual([
      'Book 6',
      'Book 5',
      video.label,
    ])
  })

  it('ranks a YouTube video a step below a film with the same weight', () => {
    const film = item({
      shelf_row: 'watching',
      medium: 'watching',
      evidence_tweet_ids: tweets(3),
    })
    const clip = item({
      shelf_row: 'watching',
      medium: 'watching',
      url: 'https://youtu.be/abcDEF12345',
      evidence_tweet_ids: tweets(3),
    })
    expect(bentoTiles([clip, film], []).map((t) => t.item.workKey)).toEqual([
      film.workKey,
      clip.workKey,
    ])
  })

  it('ranks an article link a step below another work with the same weight', () => {
    const article = item({
      shelf_row: 'reading',
      medium: 'reading',
      url: 'https://example.com/essay',
      evidence_tweet_ids: tweets(4),
    })
    const essay = item({
      shelf_row: 'reading',
      medium: 'reading',
      evidence_tweet_ids: tweets(4),
    })
    const book = item({ evidence_tweet_ids: tweets(4) })
    expect(
      pickFavourites([article, essay, book]).map((f) => f.workKey),
    ).toEqual([essay.workKey, book.workKey])
    const tiles = bentoTiles([article, book], [])
    expect(tiles.map((t) => t.item.workKey)).toEqual([
      book.workKey,
      article.workKey,
    ])
  })
})

const cover = {
  image_url: 'https://covers.openlibrary.org/b/id/1-L.jpg',
  image_source: 'openlibrary',
}

describe('bentoTiles', () => {
  it('puts favourites first, slots conversation tiles between them, then the rest by weight', () => {
    const fav = [
      item({ evidence_tweet_ids: tweets(5), ...cover }),
      item({ evidence_tweet_ids: tweets(4), ...cover }),
    ]
    const talked = item({
      shelf_row: 'reading',
      relation: 'experienced',
      echo_account_ids: ['7', '8', '9'],
      ...cover,
    })
    const video = item({
      shelf_row: 'watching',
      medium: 'watching',
      evidence_tweet_ids: tweets(2),
    })
    const tool = item({
      shelf_row: 'tools',
      medium: 'tools',
      evidence_tweet_ids: tweets(9),
    })
    const tiles = bentoTiles([...fav, talked, video, tool], fav)
    expect(tiles.map((t) => [t.kind, t.item.workKey, t.cols, t.rows])).toEqual([
      ['favourite', fav[0].workKey, 2, 3],
      ['talk', talked.workKey, 2, 2],
      ['favourite', fav[1].workKey, 2, 3],
      ['work', video.workKey, 1, 1], // a video lies wide only when it ranks high
    ])
  })

  it('keeps big tiles for pictures: without one a favourite or conversation is one wide row, a work one cell', () => {
    const fav = item({ evidence_tweet_ids: tweets(6) })
    const photographed = item({ evidence_tweet_ids: tweets(5) })
    const talked = item({
      shelf_row: 'reading',
      marks: ['liked'],
      echo_account_ids: ['7', '8', '9'],
    })
    const book = item({ evidence_tweet_ids: tweets(2) })
    const site = item({
      shelf_row: 'reading',
      evidence_tweet_ids: tweets(9),
      image_url: 'https://example.com/icon.png',
      image_source: 'favicon',
    })
    const tiles = bentoTiles(
      [fav, photographed, talked, book, site],
      [fav, photographed],
      (i) => i === photographed,
    )
    expect(
      Object.fromEntries(
        tiles.map((t) => [t.item.workKey, [t.kind, t.cols, t.rows]]),
      ),
    ).toEqual({
      [fav.workKey]: ['favourite', 2, 1],
      [photographed.workKey]: ['favourite', 2, 3], // the tweet's photo fills its top
      [talked.workKey]: ['talk', 2, 1],
      [book.workKey]: ['work', 1, 1],
      [site.workKey]: ['work', 1, 1], // a site icon is not a picture
    })
  })

  it('gives a conversation tile only to works the member read, watched or marked', () => {
    const others = ['7', '8', '9', '10']
    const mentioned = item({
      relation: 'discussed',
      echo_account_ids: others,
      evidence_tweet_ids: tweets(3),
    })
    const read = item({
      relation: 'experienced',
      echo_account_ids: others.slice(0, 3),
    })
    const marked = item({
      relation: 'cited',
      marks: ['recommended'],
      echo_account_ids: others.slice(0, 3),
    })
    const kinds = Object.fromEntries(
      bentoTiles([mentioned, read, marked], []).map((t) => [
        t.item.workKey,
        t.kind,
      ]),
    )
    expect(kinds).toEqual({
      [mentioned.workKey]: 'work',
      [read.workKey]: 'talk',
      [marked.workKey]: 'talk',
    })
  })
})

describe('youtubeId', () => {
  it('reads the video id from the link shapes people tweet', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=1Bix44C1EzY&feature=share',
      'https://youtu.be/1Bix44C1EzY?si=H-l75Pki',
      'https://m.youtube.com/shorts/1Bix44C1EzY',
    ])
      expect(youtubeId(url)).toBe('1Bix44C1EzY')
    expect(
      youtubeId('https://www.youtube.com/playlist?list=PLsI0lmQhsxix'),
    ).toBeNull()
    expect(youtubeId('https://example.com/watch?v=1Bix44C1EzY')).toBeNull()
  })
})

describe('relations', () => {
  it('turns relations into verbs for the medium, with a generic fallback', () => {
    const verb = (medium: string, relation: string) =>
      shelfVerb(
        item({
          shelf_row: medium === 'course' ? 'other' : medium,
          medium,
          relation,
        }),
      )
    expect(verb('books', 'experienced')).toBe('Read')
    expect(verb('playing', 'in_progress')).toBe('Playing')
    expect(verb('tools', 'experienced')).toBe('Used')
    expect(verb('tools', 'intends')).toBe('Wants to try')
    expect(verb('course', 'experienced')).toBe('Tried') // a medium nobody planned for
    expect(verb('reading', 'cited')).toBe('Cited')
    expect(verb('books', 'made')).toBeNull()
    expect(shelfVerb(item())).toBeNull() // before the flavor stage
  })

  it('shows a recommendation over weaker relations, never over a firsthand claim', () => {
    expect(
      shelfStatus(item({ relation: 'discussed', marks: ['recommended'] })),
    ).toBe('Recommended')
    expect(
      shelfStatus(item({ relation: 'cited', marks: ['recommended'] })),
    ).toBe('Recommended')
    expect(
      shelfStatus(item({ relation: 'experienced', marks: ['recommended'] })),
    ).toBe('Read')
    expect(shelfStatus(item({ relation: 'discussed' }))).toBeNull() // every work is talked about
  })

  it('ranks what they read above what they cited, and never favours a citation', () => {
    const read = item({
      relation: 'experienced',
      evidence_tweet_ids: tweets(2),
    })
    const cited = item({ relation: 'cited', evidence_tweet_ids: tweets(4) })
    expect(bentoTiles([cited, read], []).map((t) => t.item.workKey)).toEqual([
      read.workKey,
      cited.workKey,
    ])
    expect(pickFavourites([cited, read]).map((f) => f.workKey)).toEqual([
      read.workKey,
    ])
  })
})

describe('periods', () => {
  // A tweet id for a moment, as Twitter mints them (ms since its epoch, shifted 22 bits).
  const idAt = (iso: string) =>
    (
      (BigInt(Date.parse(iso) - 1288834974657) << BigInt(22)) +
      BigInt(7)
    ).toString()

  it('reads when a tweet was posted from its id, and falls back for old ids', () => {
    expect(
      new Date(tweetTime(idAt('2023-05-01T12:00:00Z'))!).toISOString(),
    ).toBe('2023-05-01T12:00:00.000Z')
    expect(tweetTime('20')).toBeNull()
    const old = item({
      evidence_tweet_ids: ['20'],
      first_at: '2009-06-01T00:00:00Z',
      last_at: '2009-06-01T00:00:00Z',
    })
    expect(inPeriod(old, 2009)).toBe(true)
  })

  it('matches a year or the last 12 months by any of the work’s tweets, and counts years', () => {
    const work = item({
      evidence_tweet_ids: [
        idAt('2021-03-01T00:00:00Z'),
        idAt('2024-08-01T00:00:00Z'),
      ],
    })
    expect(inPeriod(work, 2021)).toBe(true)
    expect(inPeriod(work, 2022)).toBe(false) // between its first and last tweet, but not tweeted about
    expect(inPeriod(work, 'recent', Date.parse('2025-02-01T00:00:00Z'))).toBe(
      true,
    )
    expect(inPeriod(work, 'recent', Date.parse('2026-02-01T00:00:00Z'))).toBe(
      false,
    )
    const other = item({ evidence_tweet_ids: [idAt('2024-01-01T00:00:00Z')] })
    expect(shelfYears([work, other])).toEqual([
      { year: 2024, count: 2 },
      { year: 2021, count: 1 },
    ])
  })
})

describe('shelfStats', () => {
  it('counts works, each medium and the first year', () => {
    const shelf = groupShelf('42', [
      item({ first_at: '2019-03-01T00:00:00Z' }),
      item({ shelf_row: 'watching', medium: 'watching' }),
      item({ shelf_row: 'tools', medium: 'tools' }),
    ])
    expect(
      shelfStats(shelf).map((p) => `${p.count ?? ''} ${p.text}`.trim()),
    ).toEqual(['2 works', '1 book', '1 video', '1 tool', 'since 2019'])
  })
})
