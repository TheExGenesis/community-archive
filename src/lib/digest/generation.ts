import type { PortalTweet } from '@/lib/portal/types'
import type {
  DigestCandidate,
  DigestEditionContent,
  DigestStory,
  DigestStoryCategory,
} from './types'
import { DIGEST_STORY_CATEGORIES, isRecord } from './types'

export interface EnrichedDigestCandidate {
  candidate: DigestCandidate
  commentary: PortalTweet[]
  totalReplyCount: number
}

interface ModelStory {
  category: DigestStoryCategory
  keyword: string
  title: string
  subtitle: string
  bullets: string[]
  editorialNote: string
  bangerTweetIds: string[]
  commentaryTweetIds: string[]
}

interface ParsedModelDigest {
  executiveSummary: string
  stories: ModelStory[]
  trendingKeywords: string[]
}

const cleanText = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().replace(/\s+/g, ' ')
  return cleaned && cleaned.length <= max ? cleaned : null
}

const cleanStringArray = (
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] | null => {
  if (!Array.isArray(value) || value.length > maxItems) return null
  const cleaned = value.map((item) => cleanText(item, maxLength))
  return cleaned.every((item): item is string => item !== null) ? cleaned : null
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'story'

const normalizedCorpus = (candidates: EnrichedDigestCandidate[]) =>
  candidates
    .flatMap(({ candidate, commentary }) => [
      candidate.tweet.text,
      ...commentary.map((tweet) => tweet.text),
    ])
    .join('\n')
    .toLocaleLowerCase('en-US')

const normalizedExcerpt = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')

const titleOccursInOnePost = (
  title: string,
  candidates: EnrichedDigestCandidate[],
) => {
  const excerpt = normalizedExcerpt(title)
  return candidates
    .flatMap(({ candidate, commentary }) => [
      candidate.tweet.text,
      ...commentary.map((tweet) => tweet.text),
    ])
    .some((text) => normalizedExcerpt(text).includes(excerpt))
}

const cleanCategory = (value: unknown): DigestStoryCategory | null =>
  typeof value === 'string' &&
  DIGEST_STORY_CATEGORIES.some((category) => category === value)
    ? (value as DigestStoryCategory)
    : null

function parseModelDigest(
  value: unknown,
  candidates: EnrichedDigestCandidate[],
): ParsedModelDigest {
  if (!isRecord(value)) throw new Error('Digest output is not an object')
  const executiveSummary = cleanText(value.executive_summary, 600)
  const trendingKeywords = cleanStringArray(value.trending_keywords, 12, 60)
  if (!executiveSummary || !trendingKeywords) {
    throw new Error('Digest output has an invalid summary or keyword list')
  }
  if (
    !Array.isArray(value.stories) ||
    value.stories.length < 3 ||
    value.stories.length > 5
  ) {
    throw new Error('Digest output must contain three to five stories')
  }

  const allowedBangers = new Set(
    candidates.map(({ candidate }) => candidate.tweet.id),
  )
  const allowedCommentary = new Set(
    candidates.flatMap(({ commentary }) => commentary.map((tweet) => tweet.id)),
  )
  const usedBangers = new Set<string>()
  const corpus = normalizedCorpus(candidates)

  const stories = value.stories.map((story, index): ModelStory => {
    if (!isRecord(story)) throw new Error(`Story ${index + 1} is invalid`)
    const category = cleanCategory(story.category)
    const keyword = cleanText(story.keyword, 60)
    const title = cleanText(story.title, 140)
    const subtitle = cleanText(story.subtitle, 280)
    const bullets = cleanStringArray(story.bullets, 3, 220)
    const editorialNote = cleanText(story.editorial_note, 360)
    const bangerTweetIds = cleanStringArray(story.banger_tweet_ids, 6, 20)
    const commentaryTweetIds = cleanStringArray(
      story.commentary_tweet_ids,
      5,
      20,
    )
    if (
      !category ||
      !keyword ||
      !title ||
      !subtitle ||
      !bullets?.length ||
      !editorialNote ||
      !bangerTweetIds?.length ||
      !commentaryTweetIds
    ) {
      throw new Error(`Story ${index + 1} is incomplete`)
    }
    const titleWordCount = title.split(/\s+/).length
    if (
      titleWordCount < 3 ||
      titleWordCount > 18 ||
      !titleOccursInOnePost(title, candidates)
    ) {
      throw new Error(
        `Story ${index + 1} title must be a three- to eighteen-word excerpt from one supplied post`,
      )
    }
    if (!corpus.includes(keyword.toLocaleLowerCase('en-US'))) {
      throw new Error(`Story keyword “${keyword}” does not occur in the posts`)
    }
    for (const id of bangerTweetIds) {
      if (!allowedBangers.has(id)) {
        throw new Error(`Story ${index + 1} used an unknown banger tweet ID`)
      }
      if (usedBangers.has(id)) {
        throw new Error(`Banger ${id} was assigned to more than one story`)
      }
      usedBangers.add(id)
    }
    if (commentaryTweetIds.some((id) => !allowedCommentary.has(id))) {
      throw new Error(`Story ${index + 1} used an unknown commentary tweet ID`)
    }
    return {
      category,
      keyword,
      title,
      subtitle,
      bullets,
      editorialNote,
      bangerTweetIds,
      commentaryTweetIds,
    }
  })

  const exactKeywords = trendingKeywords.filter((keyword) =>
    corpus.includes(keyword.toLocaleLowerCase('en-US')),
  )
  if (exactKeywords.length < 3) {
    throw new Error('Fewer than three generated keywords occur in the posts')
  }

  return { executiveSummary, stories, trendingKeywords: exactKeywords }
}

export function renderDigestPrompt(
  template: string,
  input: {
    digestDate: string
    windowStart: string
    windowEnd: string
    candidates: EnrichedDigestCandidate[]
  },
): string {
  const candidateJson = JSON.stringify(
    input.candidates.map(({ candidate, commentary, totalReplyCount }) => ({
      banger: candidate.tweet,
      source_rank: candidate.sourceRank,
      archived_reply_count: totalReplyCount,
      commentary,
    })),
    null,
    2,
  )
  return template
    .replaceAll('{{digest_date}}', input.digestDate)
    .replaceAll('{{window_start}}', input.windowStart)
    .replaceAll('{{window_end}}', input.windowEnd)
    .replaceAll('{{candidate_json}}', candidateJson)
}

export function assembleDigestEditionContent(input: {
  runId: string
  digestDate: string
  windowStart: string
  windowEnd: string
  allCandidateCount: number
  enrichedCandidates: EnrichedDigestCandidate[]
  modelOutput: unknown
  generatedAt?: string
}): DigestEditionContent {
  const parsed = parseModelDigest(input.modelOutput, input.enrichedCandidates)
  const bangers = new Map(
    input.enrichedCandidates.map(({ candidate }) => [
      candidate.tweet.id,
      candidate.tweet,
    ]),
  )
  const commentary = new Map(
    input.enrichedCandidates.flatMap((candidate) =>
      candidate.commentary.map((tweet) => [tweet.id, tweet] as const),
    ),
  )
  const enrichedByBanger = new Map(
    input.enrichedCandidates.map((candidate) => [
      candidate.candidate.tweet.id,
      candidate,
    ]),
  )
  const slugCounts = new Map<string, number>()

  const stories: DigestStory[] = parsed.stories.map((story) => {
    const baseSlug = slugify(story.keyword || story.title)
    const occurrence = (slugCounts.get(baseSlug) ?? 0) + 1
    slugCounts.set(baseSlug, occurrence)
    const storyBangers = story.bangerTweetIds.map((id) => bangers.get(id)!)
    const storyCommentary = story.commentaryTweetIds.map(
      (id) => commentary.get(id)!,
    )
    const related = story.bangerTweetIds
      .map((id) => enrichedByBanger.get(id))
      .filter((candidate): candidate is EnrichedDigestCandidate =>
        Boolean(candidate),
      )
    const allStoryCommentary = related.flatMap(
      (candidate) => candidate.commentary,
    )
    const peakedAt = [...storyBangers, ...allStoryCommentary]
      .map((tweet) => tweet.createdAt)
      .sort()
      .at(-1)

    return {
      slug: occurrence === 1 ? baseSlug : `${baseSlug}-${occurrence}`,
      category: story.category,
      keyword: story.keyword,
      title: story.title,
      subtitle: story.subtitle,
      bullets: story.bullets,
      editorialNote: story.editorialNote,
      bangers: storyBangers,
      commentary: storyCommentary,
      replyCount: related.reduce(
        (sum, candidate) => sum + candidate.totalReplyCount,
        0,
      ),
      peakedAt: peakedAt ?? null,
    }
  })

  const topBanger = [...input.enrichedCandidates].sort(
    (a, b) =>
      (b.candidate.tweet.quoteCount ?? 0) -
        (a.candidate.tweet.quoteCount ?? 0) ||
      b.candidate.tweet.likes - a.candidate.tweet.likes,
  )[0]?.candidate.tweet
  if (!topBanger) throw new Error('Digest has no selected bangers')

  return {
    digestDate: input.digestDate,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    executiveSummary: parsed.executiveSummary,
    topBanger,
    stories,
    keywords: Array.from(
      new Set([
        ...stories.map((story) => story.keyword),
        ...parsed.trendingKeywords,
      ]),
    ).slice(0, 12),
    source: {
      candidateCount: input.allCandidateCount,
      selectedCount: input.enrichedCandidates.length,
      runId: input.runId,
    },
  }
}
