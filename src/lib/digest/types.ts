import type { PortalTweet } from '@/lib/portal/types'

export type DigestRunStatus =
  | 'candidates_ready'
  | 'running'
  | 'completed'
  | 'failed'

export type DigestEditionStatus = 'draft' | 'published' | 'archived'

export const DIGEST_STORY_CATEGORIES = [
  'AI news',
  'News',
  'Viral joke',
  'Meme',
  'Culture',
  'Opportunity',
  'Other',
] as const

export type DigestStoryCategory = (typeof DIGEST_STORY_CATEGORIES)[number]

export interface DigestCandidate {
  tweet: PortalTweet
  sourceRank: number
  selected: boolean
}

export interface DigestRunEvent {
  at: string
  stage: 'candidates' | 'selection' | 'commentary' | 'generation' | 'edition'
  status: 'started' | 'completed' | 'failed'
  message: string
  metadata?: Record<string, string | number | boolean | null>
}

export interface DigestPromptVersion {
  id: string
  version: number
  label: string
  systemPrompt: string
  userPromptTemplate: string
  model: string
  parameters: {
    reasoning_effort?: string
    max_output_tokens?: number
  }
  createdBy: string | null
  createdAt: string
}

export interface DigestStory {
  slug: string
  /** Loose editorial label; older saved editions may predate categories. */
  category?: DigestStoryCategory
  keyword: string
  title: string
  subtitle: string
  bullets: string[]
  editorialNote?: string
  bangers: PortalTweet[]
  commentary: PortalTweet[]
  replyCount: number
  peakedAt: string | null
}

export interface DigestEditionContent {
  digestDate: string
  windowStart: string
  windowEnd: string
  generatedAt: string
  executiveSummary: string
  topBanger: PortalTweet
  stories: DigestStory[]
  keywords: string[]
  source: {
    candidateCount: number
    selectedCount: number
    runId: string
  }
}

export interface DigestRun {
  id: string
  digestDate: string
  status: DigestRunStatus
  promptVersionId: string
  windowStart: string
  windowEnd: string
  candidates: DigestCandidate[]
  modelRequest: Record<string, unknown> | null
  rawResponse: Record<string, unknown> | null
  parsedOutput: DigestEditionContent | null
  events: DigestRunEvent[]
  responseId: string | null
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  durationMs: number | null
  error: string | null
  createdBy: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
}

export interface DigestEdition {
  id: string
  issueNumber: number
  digestDate: string
  version: number
  status: DigestEditionStatus
  sourceRunId: string
  content: DigestEditionContent
  createdBy: string | null
  createdAt: string
  publishedAt: string | null
  updatedAt: string
  /** True only for local/preview fixtures that have not been published. */
  isPreview?: boolean
}

export interface DigestPreview {
  href: string
  digestDate: string
  executiveSummary: string
  storyCount: number
  storyTitles: string[]
  isPreview?: boolean
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const isNonnegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isDigestStoryCategory = (value: unknown): value is DigestStoryCategory =>
  DIGEST_STORY_CATEGORIES.some((category) => category === value)

const LEGACY_DIGEST_STORY_CATEGORIES: Record<string, DigestStoryCategory> = {
  AI: 'AI news',
  joke: 'Viral joke',
  'participatory meme': 'Meme',
  culture: 'Culture',
  science: 'News',
  politics: 'News',
  opportunity: 'Opportunity',
  other: 'Other',
}

const normalizeDigestStoryCategory = (
  value: unknown,
): DigestStoryCategory | undefined => {
  if (value === undefined) return undefined
  if (isDigestStoryCategory(value)) return value
  return typeof value === 'string'
    ? LEGACY_DIGEST_STORY_CATEGORIES[value]
    : undefined
}

export function isPortalTweet(value: unknown): value is PortalTweet {
  if (!isRecord(value)) return false
  return (
    isString(value.id) &&
    isString(value.username) &&
    isString(value.name) &&
    (value.avatar === null || typeof value.avatar === 'string') &&
    isString(value.text) &&
    isString(value.observedAt) &&
    isString(value.createdAt) &&
    isNonnegativeNumber(value.likes) &&
    isNonnegativeNumber(value.rts)
  )
}

export function parseDigestCandidates(value: unknown): DigestCandidate[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      !isPortalTweet(candidate.tweet) ||
      !Number.isInteger(candidate.sourceRank) ||
      typeof candidate.selected !== 'boolean'
    ) {
      return []
    }
    return [candidate as unknown as DigestCandidate]
  })
}

export function parseDigestRunEvents(value: unknown): DigestRunEvent[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((event) => {
    if (
      !isRecord(event) ||
      !isString(event.at) ||
      !isString(event.stage) ||
      !isString(event.status) ||
      !isString(event.message)
    ) {
      return []
    }
    return [event as unknown as DigestRunEvent]
  })
}

export function parseDigestEditionContent(
  value: unknown,
): DigestEditionContent | null {
  if (
    !isRecord(value) ||
    !isString(value.digestDate) ||
    !isString(value.windowStart) ||
    !isString(value.windowEnd) ||
    !isString(value.generatedAt) ||
    !isString(value.executiveSummary) ||
    !isPortalTweet(value.topBanger) ||
    !Array.isArray(value.stories) ||
    !Array.isArray(value.keywords) ||
    !isRecord(value.source)
  ) {
    return null
  }

  const stories = value.stories.flatMap((story) => {
    const category = isRecord(story)
      ? normalizeDigestStoryCategory(story.category)
      : undefined
    if (
      !isRecord(story) ||
      !isString(story.slug) ||
      !(story.category === undefined || category !== undefined) ||
      !isString(story.keyword) ||
      !isString(story.title) ||
      !isString(story.subtitle) ||
      !Array.isArray(story.bullets) ||
      !story.bullets.every(isString) ||
      !(story.editorialNote === undefined || isString(story.editorialNote)) ||
      !Array.isArray(story.bangers) ||
      !story.bangers.every(isPortalTweet) ||
      !Array.isArray(story.commentary) ||
      !story.commentary.every(isPortalTweet) ||
      !isNonnegativeNumber(story.replyCount) ||
      !(story.peakedAt === null || typeof story.peakedAt === 'string')
    ) {
      return []
    }
    return [
      {
        ...story,
        ...(category ? { category } : {}),
      } as unknown as DigestStory,
    ]
  })

  if (stories.length !== value.stories.length || stories.length === 0) {
    return null
  }
  if (!value.keywords.every(isString)) return null
  if (
    !isNonnegativeNumber(value.source.candidateCount) ||
    !isNonnegativeNumber(value.source.selectedCount) ||
    !isString(value.source.runId)
  ) {
    return null
  }

  return { ...value, stories } as unknown as DigestEditionContent
}
