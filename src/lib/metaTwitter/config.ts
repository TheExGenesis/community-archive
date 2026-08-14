/**
 * Chapter/topic configuration for the Meta Twitter profile.
 *
 * Topics are the human-readable "what was this person into" labels per year.
 * Each topic carries FTS terms used to scope tweets/media to that theme.
 * For now this is hand-curated for @christineist (the pilot profile); the
 * long-term plan is AI-generated defaults editable by the profile owner.
 */

export interface TopicConfig {
  /** Human-readable label, e.g. "Building Cuties" */
  label: string
  /** URL-safe slug, e.g. "building-cuties" */
  slug: string
  /** Full-text-search terms OR'd together to scope tweets to this topic */
  terms: string[]
  /** Optional one-line description shown in the context header */
  description?: string
}

export interface ChapterConfig {
  year: number
  /** Short generated description of the era */
  description?: string
  topics: TopicConfig[]
}

export interface MetaTwitterProfileConfig {
  accountId: string
  /** Description for the Overall / Hall of Fame chapter */
  overallDescription: string
  /** Topic pills shown on the Overall view (recurring interests across years) */
  overallTopics: TopicConfig[]
  chapters: ChapterConfig[]
  /** Tweet IDs pinned into the Hall of Fame regardless of engagement */
  hallOfFamePinned: string[]
}

// Shared topic building blocks (term lists validated against the live archive
// via FTS counts, 2026-08).
const T = {
  cuties: {
    label: 'barreled along by cuties',
    slug: 'building-cuties',
    terms: ['cuties', 'matchmaking'],
    description:
      'Building the cuties dating app — dinners, group chats, and social infrastructure as plumbing for serendipity.',
  },
  friendship: {
    label: 'what do your friends ask you for',
    slug: 'friendship',
    terms: ['friends', 'friendship'],
    description: 'On making, keeping, and introducing friends to one another.',
  },
  dating: {
    label: 'always go on 2 dates',
    slug: 'dating',
    terms: ['dating', 'romance'],
    description: 'Dating discourse, field notes from the romantic frontier.',
  },
  community: {
    label: 'oh, I have a home again',
    slug: 'community',
    terms: ['community', 'dinner party'],
    description: 'Community building — dinners as infrastructure.',
  },
  art: {
    label: 'experimental art parties',
    slug: 'art',
    terms: ['art', 'painting', 'museum'],
    description: 'Art, beauty, and feeling seen by paintings.',
  },
  ai: {
    label: 'social ai, tools for community flourishing',
    slug: 'ai',
    terms: ['AI', 'startup'],
    description: 'AI, startups, and building in public.',
  },
  sf: {
    label: 'go look lost at config',
    slug: 'sf',
    terms: ['sf', 'san francisco'],
    description: 'San Francisco as a group project.',
  },
} satisfies Record<string, TopicConfig>

/** Profiles with curated Meta Twitter config, keyed by account_id. */
export const META_TWITTER_PROFILES: Record<string, MetaTwitterProfileConfig> = {
  // christine (@christineist) — pilot profile
  '826134955549790208': {
    accountId: '826134955549790208',
    overallDescription:
      "the five-minute version of nine years — christine's greatest hits",
    overallTopics: [T.cuties, T.friendship, T.dating, T.community, T.art, T.ai],
    chapters: [
      {
        year: 2026,
        description:
          'Building in public, dinners as infrastructure, and a softer internet.',
        topics: [
          { ...T.cuties, label: "hey they're on cuties!" },
          { ...T.community, label: 'like YC but for public goods' },
          { ...T.ai, label: 'social ai, tools for community flourishing' },
          { ...T.friendship, label: 'what do your friends ask you for' },
        ],
      },
      {
        year: 2025,
        description: 'The year Cuties went from group chat to institution.',
        topics: [
          { ...T.cuties, label: 'barreled along by cuties' },
          { ...T.friendship, label: 'little groups of 3-4 friends' },
          { ...T.community, label: 'find the next N lonely' },
          { ...T.sf, label: 'lovember is happening btw' },
        ],
      },
      {
        year: 2024,
        description:
          'Cuties gets serious, the dating discourse compounds, and the bangers keep landing.',
        topics: [
          { ...T.cuties, label: '3rd relationship from cuties!' },
          { ...T.dating, label: 'always go on 2 dates' },
          { ...T.friendship, label: 'weddings of all of my major friendships' },
          { ...T.ai, label: 'fertility clinic or open ai?' },
        ],
      },
      {
        year: 2023,
        description:
          'Peak dating discourse, viral late-twenties wisdom, and the first cuties experiments.',
        topics: [
          { ...T.dating, label: '+5 admiration points' },
          { ...T.friendship, label: "you can't just cut and leave" },
          { ...T.community, label: 'doing the community a favor' },
          { ...T.art, label: 'those who get rothko paintings' },
        ],
      },
      {
        year: 2022,
        description:
          'Friendship maximalism, art feelings, and the group chat era.',
        topics: [
          { ...T.friendship, label: 'treat everyone like friends' },
          { ...T.art, label: 'experimental art parties' },
          { ...T.dating, label: 'a massive singles group chat' },
          { ...T.ai, label: 'therapy of the future' },
        ],
      },
    ],
    hallOfFamePinned: [
      '1683951437716549636', // late twenties decisions compound
      '1812364916906471452', // uncanny valley parallel-track friendships
      '1780801621011685885', // oh my god what a love story
      '1797180600308408522', // Francine Van Hove paintings
      '1672424637886525440', // darling effect
    ],
  },
}

export const getMetaTwitterConfig = (
  accountId: string,
): MetaTwitterProfileConfig | null => META_TWITTER_PROFILES[accountId] ?? null
