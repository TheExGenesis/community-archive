/**
 * Curated subsections inside a chapter (a year) of an account's archive.
 *
 * A section title is a phrase quoted verbatim from one of the tweets it holds,
 * so a chapter reads as an idea the person was actually chewing on rather than
 * a generic label. Membership is an explicit list of tweet IDs: the chapters
 * are small enough to curate by hand, and matching on terms would quietly
 * mis-file posts. Every chapter with curated sections also gets a trailing
 * catch-all so no banger becomes unreachable.
 *
 * Accounts without an entry render their chapters unsectioned.
 */

export interface ChapterSection {
  /** URL-safe identifier, kept stable once published. */
  slug: string
  /** Quoted phrase from one of the section's tweets. */
  title: string
  /** Tweets in the section; empty for the catch-all. */
  tweetIds: string[]
}

export type SectionsByYear = Record<number, ChapterSection[]>

export const OTHER_SECTION_SLUG = 'other'

const CURATED_SECTIONS: Record<string, Record<number, ChapterSection[]>> = {
  // @christineist
  '826134955549790208': {
    2022: [
      {
        slug: 'unabashedly-weird',
        title: 'unabashedly weird on this app',
        tweetIds: [
          '1551996871584796672', // I made a guide to tpot!
          '1605591960810446848', // Try my fake twitter
          '1502765137714835456', // thankful to those who are unabashedly weird
          '1591536191459196928', // full fractal buy in
        ],
      },
      {
        slug: 'more-agreeable-less-agreeable',
        title: 'be more agreeable, less agreeable',
        tweetIds: [
          '1569948792384012291', // ways to play with your identity, life, frame
          '1567309182248034305', // IRL//URL Persona Party
          '1570639073194409986', // give me your mildest roast
        ],
      },
    ],
    2023: [
      {
        slug: 'languishing',
        title: 'languishing is an important aspect of the creative process',
        tweetIds: [
          '1657102796418842624', // languishing
          '1677708469363933186', // where to direct my creative compulsion
          '1668994334652350464', // Alone Time (2023)
          '1673936919250731008', // self healing platter
          '1613664220662616065', // book club
          '1694804705640390736', // last selfie / last meme
        ],
      },
      {
        slug: 'five-dollars-back-and-forth',
        title: 'sending $5 back and forth for arbitrary small tasks',
        tweetIds: [
          '1675937321437519872', // era of tpot people sending $5
          '1673783325746659330', // tpot x grand budapest hotel
          '1682229717829832704', // dating app I made for this twitter scene
          '1623445824658104320', // was made for this scenario
        ],
      },
      {
        slug: 'beginnings-of-a-relationship',
        title: 'how you start a relationship',
        tweetIds: [
          '1720092106335899905', // beginnings of a relationship
          '1683951437716549636', // decisions compound in your late twenties
          '1723096316354625924', // processed a lot of grief
          '1691315356760240128', // smell depression on other people
        ],
      },
    ],
    2024: [
      {
        slug: 'what-is-your-gift',
        title: 'what is your gift?',
        tweetIds: [
          '1870511170354102435', // what is your gift?
          '1816257836764258420', // default rules for your life
          '1816636343545659896', // what other people seem weirdly bad at
          '1870173258135547978', // developing your intuition
        ],
      },
      {
        slug: 'lush-and-full-of-sinkholes',
        title: 'the mind is lush and full of sinkholes',
        tweetIds: [
          '1821940561861042286', // the mind is lush and full of sinkholes
          '1765572833793740802', // speech coaching
          '1765594671101977059', // speech coaching notes
          '1768063040409481645', // after the IFS rabbit hole
          '1742695713006637298', // relax my mind's grip
          '1744918785801490664', // Heidi Priebe nuggets
        ],
      },
      {
        slug: 'little-groups',
        title: 'little groups of 3-4 friends',
        tweetIds: [
          '1851528581190496499', // little groups of 3-4 friends
          '1812364916906471452', // an unsurpassable chasm
          '1780801621011685885', // oh my god what a love story
          '1824491550732325364', // dating is so cute
          '1790530430317506689', // desire for status vs unconditional love
        ],
      },
    ],
    2025: [
      {
        slug: 'self-reinforcing-life',
        title: 'a self reinforcing life',
        tweetIds: [
          '1939336962634379386', // build a self reinforcing life
          '2000745322880852135', // life experiments doc
          '1944559102417359198', // learning to exist body-first
          '1986965809239920944', // trying again is such an important skill
          '1964084312816419274', // don't sell yourself short
          '1998839022924210200', // ch 11 on self actualizing people
          '1999745513134977102', // much evil lies downstream of insecurity
        ],
      },
      {
        slug: 'nyc-in-october',
        title: 'everyone should come to nyc in october',
        tweetIds: [
          '1953280891641270684', // everyone should come to nyc in october
          '1984328799865967079', // last day of Vibetober
          '1972660631011574032', // hyperstition for vibetober
          '1985133318451466320', // Post-Vibetober Hyperstition Market
          '1988722741252616437', // set your friends up this lovember
        ],
      },
      {
        slug: 'write-every-day',
        title: 'write/publish every day for the month of jan',
        tweetIds: [
          '1999747201338343708', // inkuary
          '1979975666326986822', // christianuary
          '1951278607772303389', // I started a podcast!
          '1966155567048839547', // yin vs yang community building
        ],
      },
      {
        slug: 'things-my-friends-made',
        title: 'things my friends made',
        tweetIds: [
          '1888964775301759170', // consumption diet of things my friends made
          '1941739989487730765', // little groups start to collaborate
          '1961102726173180257', // I want this conversation to end
          '1950593989276578034', // let my nervous system dictate my dating life
          '1974548861537652901', // omg new cutie!
        ],
      },
    ],
    2026: [
      {
        slug: 'friends-to-close-friends',
        title: 'how to go from friends to close friends',
        tweetIds: [
          '2056850826845434327', // friends to close friends
          '2056139632262218232', // what do your friends ask you for
          '2047059484564926742', // you need shared social context
          '2027274733209731578', // traits most missing in friendships
          '2035720176839057792', // on parenthood and male friendships
        ],
      },
      {
        slug: 'a-new-brain',
        title: 'my brain opened a new brain',
        tweetIds: [
          '2030656994969854120', // my brain opened a new brain
          '2007502981386907946', // extrinsic to intrinsic motivation
          '2051042129254965667', // adult children of emotionally immature parents
          '2054259444226183553', // how often has your gut led you astray
          '2030860958449504707', // fuck around and find out: the cult
        ],
      },
    ],
  },
}

const otherSection = (): ChapterSection => ({
  slug: OTHER_SECTION_SLUG,
  title: 'other',
  tweetIds: [],
})

/** Closes a non-empty section list with the catch-all. */
export const withCatchAll = (sections: ChapterSection[]): ChapterSection[] =>
  sections.length ? [...sections, otherSection()] : []

/** Hand-curated sections for an account, or null to fall back to generation. */
export const curatedSectionsByYear = (
  accountId: string,
): SectionsByYear | null => {
  const curated = CURATED_SECTIONS[accountId]
  if (!curated) return null
  return Object.fromEntries(
    Object.entries(curated).map(([year, sections]) => [
      year,
      withCatchAll(sections),
    ]),
  )
}

/**
 * The catch-all holds whatever the curated sections left behind, so a chapter
 * that gains bangers after curation still shows all of them somewhere.
 */
export const chapterSectionTweets = <T extends { tweet_id: string }>(
  sections: ChapterSection[],
  section: ChapterSection,
  tweets: T[],
): T[] => {
  if (section.slug !== OTHER_SECTION_SLUG) {
    const ids = new Set(section.tweetIds)
    return tweets.filter((tweet) => ids.has(tweet.tweet_id))
  }
  const curated = new Set(sections.flatMap((entry) => entry.tweetIds))
  return tweets.filter((tweet) => !curated.has(tweet.tweet_id))
}
