export const COMMUNITY_PROJECT_CATEGORIES = [
  'All',
  'Tools',
  'Experiments',
  'Research',
  'Games',
] as const

export type CommunityProjectCategory = Exclude<
  (typeof COMMUNITY_PROJECT_CATEGORIES)[number],
  'All'
>

export type CommunityProjectSort = 'Featured' | 'Newest' | 'A–Z'

export interface CommunityProject {
  databaseId?: string
  slug: string
  name: string
  creator: string
  creatorHandle?: string
  summary: string
  description: string
  archiveUse: string
  category: CommunityProjectCategory
  tags: string[]
  projectUrl?: string
  sourceTweetId: string
  sourceUrl?: string
  image?: string
  coverClass: string
  featured: boolean
  publishedAt: string
}

/**
 * Curated community-made projects verified against the public Community
 * Archive thread rooted at tweet 1961022793023119441. First-party Community
 * Archive tools and fictional prototype entries are intentionally excluded.
 */
export const COMMUNITY_PROJECTS: CommunityProject[] = [
  {
    slug: 'bangers-page',
    name: 'Bangers.page',
    creator: 'Sam Clarke',
    summary:
      'Browse high-signal posts through a community-made thematic index.',
    description:
      'A third-party Community Archive build that organizes standout posts with high-quality thematic tags for a faster way into the corpus.',
    archiveUse:
      'Groups standout archived posts into thematic collections that can be browsed without writing a search query.',
    category: 'Tools',
    tags: ['Themes', 'Discovery', 'Curated browsing'],
    projectUrl: 'https://bangers.page/',
    sourceTweetId: '2089848291416850870',
    image: '/images/community/bangers-page.jpg',
    coverClass: 'from-[#f1eee6] via-[#d7e4ef] to-[#75c9eb]',
    featured: true,
    publishedAt: '2026-08-18',
  },
  {
    slug: 'tweet-harvest',
    name: 'Tweet Harvest',
    creator: 'Loopy',
    creatorHandle: 'strangestloop',
    summary: 'Explore an archive through word clouds, emoji, chats, and hits.',
    description:
      'A playful personal archive explorer that turns a timeline into browsable word clouds, top emoji, chat histories, and standout posts.',
    archiveUse:
      'Transforms a person’s archived posts and conversations into visual summaries and navigable chat history.',
    category: 'Tools',
    tags: ['Personal archive', 'Word clouds', 'Conversations'],
    projectUrl: 'https://strangestloop.io/tweet-harvest/',
    sourceTweetId: '1953831721931026730',
    image: '/images/community/tweet-harvest-cover.png',
    coverClass: 'from-[#ffb5d8] via-[#ffd7e8] to-[#8bd2ee]',
    featured: true,
    publishedAt: '2025-08-08',
  },
  {
    slug: 'magic-search',
    name: 'Magic Search',
    creator: 'Sofi Vanhanen',
    creatorHandle: 'sofvanh',
    summary: 'Find a future collaborator, friend, or favorite account by idea.',
    description:
      'An experimental people-finder that uses semantic summaries of Community Archive accounts to help people discover potential collaborators and kindred spirits.',
    archiveUse:
      'Builds semantic summaries and embeddings from participating accounts, then matches natural-language searches to people.',
    category: 'Experiments',
    tags: ['People discovery', 'Semantic matching', 'Embeddings'],
    projectUrl: 'https://magicsearch.sofiavanhanen.fi/',
    sourceTweetId: '1978455670220361896',
    image: '/images/community/magic-search.jpg',
    coverClass: 'from-[#8bd2ee] via-[#75c9eb] to-[#10516b]',
    featured: true,
    publishedAt: '2025-10-15',
  },
  {
    slug: 'new-words-and-their-pioneers',
    name: 'New Words and Their Pioneers',
    creator: 'Ivan Vendrov',
    creatorHandle: 'ivanvendrov',
    summary: 'Trace emerging language through the people who used it first.',
    description:
      'The winning Community Archive NYC hackathon research project, mapping the emergence of new words in the archive and identifying their early pioneers.',
    archiveUse:
      'Analyzes word usage over time to find emerging vocabulary and the accounts that adopted it earliest.',
    category: 'Research',
    tags: ['Language', 'Idea diffusion', 'Hackathon winner'],
    sourceTweetId: '1961022809938722831',
    image: '/images/community/new-words-and-their-pioneers-cover.webp',
    coverClass: 'from-[#f3d36b] via-[#f0a660] to-[#1e9bcd]',
    featured: true,
    publishedAt: '2025-08-28',
  },
  {
    slug: 'vector-search',
    name: 'Semantic Search',
    creator: 'Corbin',
    creatorHandle: 'corbindreams',
    summary: 'Search favorite accounts by meaning instead of exact wording.',
    description:
      'A focused vector-search interface for finding memorable posts from a hand-picked set of favorite accounts when native keyword search falls short.',
    archiveUse:
      'Indexes posts from selected archived accounts as vectors so related ideas can be found without exact keyword matches.',
    category: 'Tools',
    tags: ['Vector search', 'Reference', 'Favorite accounts'],
    projectUrl: 'https://tweets-search-811136861157.us-central1.run.app',
    sourceTweetId: '2087250967527870861',
    image: '/images/community/tweet-semantic-search-cover.png',
    coverClass: 'from-[#17171a] via-[#10516b] to-[#25aadf]',
    featured: false,
    publishedAt: '2026-08-11',
  },
  {
    slug: 'malcolm-ocean-links',
    name: "Malcolm Ocean's Links",
    creator: 'Malcolm Ocean',
    creatorHandle: 'Malcolm_Ocean',
    summary: 'Describe something Malcolm shared and let the archive find it.',
    description:
      'A personal redirect service that turns a free-form phrase into the right link from Malcolm’s writing, videos, public notes, website, and archived posts.',
    archiveUse:
      'Indexes more than fourteen thousand of Malcolm’s archived posts alongside his other public work so an AI can resolve plain-language link requests.',
    category: 'Tools',
    tags: ['Personal knowledge', 'AI retrieval', 'Links'],
    projectUrl: 'https://malcolm.linksyou.to/',
    sourceTweetId: '2087049518177210837',
    image: '/images/community/malcolm-ocean-links-cover.png',
    coverClass: 'from-[#f4f0ff] via-[#b8a7ff] to-[#5940d6]',
    featured: false,
    publishedAt: '2026-08-11',
  },
  {
    slug: 'community-archive-radio',
    name: 'Community Archive Radio',
    creator: 'Joshua',
    creatorHandle: 'workflowsauce',
    summary: 'Turn interesting archive conversations into mini radio segments.',
    description:
      'An open-source experiment that finds interesting discussions in the archive and turns them into short, shareable radio-style segments.',
    archiveUse:
      'Selects discussions from the archive and remixes them into generated audio segments with links back to the source posts.',
    category: 'Experiments',
    tags: ['Audio', 'Generative media', 'Open source'],
    projectUrl: 'https://twit.fm',
    sourceTweetId: '2089032285404504178',
    image: '/images/community/community-archive-radio-cover.png',
    coverClass: 'from-[#352b70] via-[#7956d8] to-[#8bd2ee]',
    featured: false,
    publishedAt: '2026-08-16',
  },
  {
    slug: 'followle',
    name: 'Followle',
    creator: 'Loopy',
    creatorHandle: 'strangestloop',
    summary: 'Guess who someone follows in a quick, surprisingly tricky game.',
    description:
      'A social-graph guessing game built from Community Archive data. Pick an account, play a run of rounds, and see how well you know their neighborhood.',
    archiveUse:
      'Turns public following relationships in the archive into short rounds where players guess whether one account follows another.',
    category: 'Games',
    tags: ['Social graph', 'Guessing game', 'Play'],
    projectUrl: 'https://strangestloop.io/followle',
    sourceTweetId: '2091196447723045080',
    image: '/images/community/followle-cover.png',
    coverClass: 'from-[#f8cb52] via-[#ff8a65] to-[#25aadf]',
    featured: false,
    publishedAt: '2026-08-22',
  },
]

export function filterCommunityProjects(
  projects: CommunityProject[],
  query: string,
  category: (typeof COMMUNITY_PROJECT_CATEGORIES)[number],
  sort: CommunityProjectSort,
): CommunityProject[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = projects.filter((project) => {
    if (category !== 'All' && project.category !== category) return false
    if (!normalizedQuery) return true

    return [
      project.name,
      project.creator,
      project.creatorHandle,
      project.summary,
      project.description,
      project.category,
      ...project.tags,
    ]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(normalizedQuery))
  })

  return [...filtered].sort((left, right) => {
    if (sort === 'Newest') {
      return right.publishedAt.localeCompare(left.publishedAt)
    }
    if (sort === 'A–Z') return left.name.localeCompare(right.name)
    return Number(right.featured) - Number(left.featured)
  })
}
