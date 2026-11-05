export const OWN_TWEETS_PAGE_SIZE = 50

export const ownTweetKinds = ['all', 'original', 'replies'] as const
export const ownTweetSorts = [
  'newest',
  'oldest',
  'least_liked',
  'most_liked',
] as const
export const ownTweetAges = [0, 1, 3, 5, 10] as const

export type OwnTweetKind = (typeof ownTweetKinds)[number]
export type OwnTweetSort = (typeof ownTweetSorts)[number]

export type OwnTweetSearch = {
  // Web-search syntax: words, "exact phrases", OR, and -excluded words.
  query?: string
  kind?: OwnTweetKind
  olderThanYears?: number
  sort?: OwnTweetSort
  offset?: number
}

export function normalizeOwnTweetSearch(search: OwnTweetSearch) {
  const query =
    typeof search.query === 'string' ? search.query.trim().slice(0, 500) : ''
  const kind = ownTweetKinds.includes(search.kind as OwnTweetKind)
    ? (search.kind as OwnTweetKind)
    : 'all'
  const sort = ownTweetSorts.includes(search.sort as OwnTweetSort)
    ? (search.sort as OwnTweetSort)
    : 'newest'
  const olderThanYears = ownTweetAges.includes(
    search.olderThanYears as (typeof ownTweetAges)[number],
  )
    ? (search.olderThanYears as number)
    : 0
  const offset =
    Number.isInteger(search.offset) && (search.offset as number) > 0
      ? Math.min(search.offset as number, 10_000)
      : 0
  return { query, kind, olderThanYears, sort, offset }
}

const anyOf = (...terms: string[]) => terms.join(' or ')

// Starting points for a cleanup pass. Queries are matched with English
// stemming, so "fuck" also finds "fucking" and "hate" finds "hated".
export const ownTweetPatterns: Array<{
  id: string
  label: string
  description: string
  search: Omit<OwnTweetSearch, 'offset'>
}> = [
  {
    id: 'profanity',
    label: 'Swearing',
    description: 'Profanity and crude language',
    search: {
      query: anyOf(
        'fuck',
        'shit',
        'damn',
        'bitch',
        'crap',
        'ass',
        'asshole',
        'piss',
        'bastard',
        'dick',
        'wtf',
        'stfu',
        'fml',
      ),
    },
  },
  {
    id: 'insults',
    label: 'Insults',
    description: 'Name-calling and put-downs',
    search: {
      query: anyOf(
        'stupid',
        'idiot',
        'dumb',
        'moron',
        'loser',
        'pathetic',
        'clown',
        'cringe',
        '"shut up"',
        'trash',
        'garbage',
        'ugly',
      ),
    },
  },
  {
    id: 'politics',
    label: 'Politics',
    description: 'Elections, parties and politicians',
    search: {
      query: anyOf(
        'trump',
        'biden',
        'obama',
        'clinton',
        'election',
        'democrat',
        'republican',
        'liberal',
        'conservative',
        'leftist',
        'maga',
        'woke',
        'brexit',
        'vote',
      ),
    },
  },
  {
    id: 'venting',
    label: 'Venting',
    description: 'Rants, anger and complaints',
    search: {
      query: anyOf(
        'hate',
        'angry',
        'furious',
        'annoying',
        'worst',
        '"sick of"',
        '"fed up"',
        'ugh',
        'rant',
        'pissed',
      ),
    },
  },
  {
    id: 'partying',
    label: 'Drinking & drugs',
    description: 'Nights out, hangovers and substances',
    search: {
      query: anyOf(
        'drunk',
        'hungover',
        'hangover',
        'wasted',
        'weed',
        'stoned',
        'shots',
        'blackout',
        'beer',
        'vodka',
        'tequila',
      ),
    },
  },
  {
    id: 'work',
    label: 'Work',
    description: 'Bosses, coworkers and jobs',
    search: {
      query: anyOf(
        'boss',
        'coworker',
        'coworkers',
        'manager',
        'fired',
        'salary',
        '"my job"',
        'interview',
        'quit',
        'layoff',
      ),
    },
  },
  {
    id: 'relationships',
    label: 'Dating & exes',
    description: 'Relationships, crushes and breakups',
    search: {
      query: anyOf(
        '"my ex"',
        'girlfriend',
        'boyfriend',
        'dating',
        'breakup',
        '"broke up"',
        'crush',
        'tinder',
        'hinge',
        'divorce',
      ),
    },
  },
  {
    id: 'personal',
    label: 'Personal & health',
    description: 'Mental health, family and private details',
    search: {
      query: anyOf(
        'depressed',
        'depression',
        'anxiety',
        'therapy',
        'therapist',
        'lonely',
        'diagnosed',
        'medication',
        '"my mom"',
        '"my dad"',
        '"my address"',
        '"my number"',
      ),
    },
  },
  {
    id: 'old-replies',
    label: 'Old ignored replies',
    description: 'Replies over 5 years old, least-liked first',
    search: { kind: 'replies', olderThanYears: 5, sort: 'least_liked' },
  },
  {
    id: 'old',
    label: 'Oldest tweets',
    description: 'Everything over 10 years old',
    search: { olderThanYears: 10, sort: 'oldest' },
  },
  {
    id: 'flops',
    label: 'Least liked',
    description: 'Tweets nobody engaged with',
    search: { kind: 'original', sort: 'least_liked' },
  },
]
