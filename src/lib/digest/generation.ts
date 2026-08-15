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
  /** IDs within commentary that are replies; every other commentary row is a quote post. */
  replyTweetIds?: string[]
  totalReplyCount: number
}

interface ModelStory {
  category: DigestStoryCategory
  title: string
  subtitle: string
  bullets: string[]
  editorialNote: string
  tweetIndices: number[]
}

interface ParsedModelDigest {
  executiveSummary: string[]
  representativeTweetIndex: number
  stories: ModelStory[]
  keywords: string[]
  editorialWarnings: string[]
}

export type DigestPromptTweetKind = 'banger' | 'quote' | 'reply'

export interface DigestPromptCorpusRow {
  index: number
  kind: DigestPromptTweetKind
  parentBangerIndex: number | null
  tweetId: string
  tweet: PortalTweet
}

export interface DigestContinuityContext {
  digestDate: string
  executiveSummary: string[]
  storyTitles: string[]
  keywords: string[]
}

export function selectDailyDigestBangers(tweets: PortalTweet[]): PortalTweet[] {
  return tweets.filter((tweet) => (tweet.quoteCount ?? 0) >= 2).slice(0, 50)
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

const cleanIndexArray = (value: unknown, maxItems: number): number[] | null => {
  if (!Array.isArray(value) || value.length > maxItems) return null
  return value.every(
    (item): item is number => Number.isSafeInteger(item) && item >= 0,
  )
    ? value
    : null
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'story'

const normalizedCorpus = (corpus: DigestPromptCorpusRow[]) =>
  corpus
    .map(({ tweet }) => tweet.text)
    .join('\n')
    .toLocaleLowerCase('en-US')

const normalizedExcerpt = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')

const titleOccursInOnePost = (
  title: string,
  corpus: DigestPromptCorpusRow[],
) => {
  const excerpt = normalizedExcerpt(title)
  return corpus.some(({ tweet }) =>
    normalizedExcerpt(tweet.text).includes(excerpt),
  )
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
  const corpus = buildDigestPromptCorpus(candidates)
  const executiveSummary = cleanStringArray(value.executive_summary, 3, 300)
  const keywords = cleanStringArray(value.keywords, 12, 60)
  const representativeTweetIndex = value.representative_tweet_index
  if (
    !executiveSummary ||
    executiveSummary.length !== 3 ||
    !keywords ||
    typeof representativeTweetIndex !== 'number' ||
    !Number.isSafeInteger(representativeTweetIndex) ||
    representativeTweetIndex < 0 ||
    representativeTweetIndex >= corpus.length
  ) {
    throw new Error(
      'Digest output must have exactly three summary bullets, a representative tweet index, and a valid keyword list',
    )
  }
  if (
    !Array.isArray(value.stories) ||
    value.stories.length < 3 ||
    value.stories.length > 5
  ) {
    throw new Error('Digest output must contain three to five stories')
  }

  const usedBangers = new Set<string>()
  const normalizedAllPosts = normalizedCorpus(corpus)
  const editorialWarnings = executiveSummary.flatMap((bullet, index) =>
    bullet.length < 35 || bullet.length > 140
      ? [`Summary bullet ${index + 1} is outside the 35–140 character target.`]
      : [],
  )

  const stories = value.stories.map((story, index): ModelStory => {
    if (!isRecord(story)) throw new Error(`Story ${index + 1} is invalid`)
    const category = cleanCategory(story.category)
    const title = cleanText(story.title, 300)
    const subtitle = cleanText(story.subtitle, 500)
    const bullets = cleanStringArray(story.bullets, 3, 220)
    const editorialNote = cleanText(story.editorial_note, 360)
    const tweetIndices = cleanIndexArray(story.tweet_indices, 18)
    if (
      !category ||
      !title ||
      !subtitle ||
      !bullets?.length ||
      !editorialNote ||
      !tweetIndices?.length
    ) {
      throw new Error(`Story ${index + 1} is incomplete`)
    }
    const indexedTweets = tweetIndices.map((tweetIndex) => {
      const row = corpus[tweetIndex]
      if (!row) {
        throw new Error(`Story ${index + 1} used an unknown tweet index`)
      }
      return row
    })
    if (new Set(tweetIndices).size !== tweetIndices.length) {
      throw new Error(`Story ${index + 1} repeated a tweet index`)
    }
    const bangerRows = indexedTweets.filter(({ kind }) => kind === 'banger')
    if (!bangerRows.length) {
      throw new Error(
        `Story ${index + 1} must include at least one banger index`,
      )
    }
    const titleWordCount = title.split(/\s+/).length
    if (titleWordCount < 3 || titleWordCount > 18 || title.length > 110) {
      editorialWarnings.push(
        `Story ${index + 1} title is outside the 3–18 word / 110 character target.`,
      )
    }
    if (!titleOccursInOnePost(title, indexedTweets)) {
      editorialWarnings.push(
        `Story ${index + 1} title is a paraphrase rather than an exact tweet excerpt.`,
      )
    }
    if (subtitle.length < 60 || subtitle.length > 320) {
      editorialWarnings.push(
        `Story ${index + 1} subtitle is outside the 60–320 character target.`,
      )
    }
    for (const { tweetId } of bangerRows) {
      if (usedBangers.has(tweetId)) {
        throw new Error(`Banger ${tweetId} was assigned to more than one story`)
      }
      usedBangers.add(tweetId)
    }
    return {
      category,
      title,
      subtitle,
      bullets,
      editorialNote,
      tweetIndices,
    }
  })

  const exactKeywords = keywords.filter((keyword) =>
    normalizedAllPosts.includes(keyword.toLocaleLowerCase('en-US')),
  )
  if (exactKeywords.length < 3) {
    throw new Error('Fewer than three generated keywords occur in the posts')
  }

  return {
    executiveSummary,
    representativeTweetIndex,
    stories,
    keywords: exactKeywords,
    editorialWarnings,
  }
}

/**
 * Build the deterministic, zero-indexed corpus shared by the prompt renderer
 * and output receiver. Bangers always occupy the first N indices, so index 0 is
 * the highest-ranked banger. Context follows in candidate order.
 */
export function buildDigestPromptCorpus(
  candidates: EnrichedDigestCandidate[],
): DigestPromptCorpusRow[] {
  const bangerRows = candidates.map(
    ({ candidate }, index): DigestPromptCorpusRow => ({
      index,
      kind: 'banger',
      parentBangerIndex: null,
      tweetId: candidate.tweet.id,
      tweet: candidate.tweet,
    }),
  )
  const seenTweetIds = new Set(bangerRows.map(({ tweetId }) => tweetId))
  const contextRows: DigestPromptCorpusRow[] = []

  candidates.forEach(({ commentary, replyTweetIds }, parentBangerIndex) => {
    const replies = new Set(replyTweetIds ?? [])
    commentary.forEach((tweet) => {
      if (seenTweetIds.has(tweet.id)) return
      seenTweetIds.add(tweet.id)
      contextRows.push({
        index: bangerRows.length + contextRows.length,
        kind: replies.has(tweet.id) ? 'reply' : 'quote',
        parentBangerIndex,
        tweetId: tweet.id,
        tweet,
      })
    })
  })

  return [...bangerRows, ...contextRows]
}

const promptTweet = (tweet: PortalTweet) => ({
  author: `@${tweet.username}`,
  display_name: tweet.name,
  created_at: tweet.createdAt,
  text: tweet.text,
  likes: tweet.likes,
  reposts: tweet.rts,
  has_media: Boolean(tweet.media?.length),
})

export function renderDigestPrompt(
  template: string,
  input: {
    digestDate: string
    windowStart: string
    windowEnd: string
    candidates: EnrichedDigestCandidate[]
    priorDigests?: DigestContinuityContext[]
  },
): string {
  const corpus = buildDigestPromptCorpus(input.candidates)
  const candidateJson = JSON.stringify(
    corpus.map((row) => {
      const candidate =
        row.kind === 'banger'
          ? input.candidates[row.index]?.candidate
          : undefined
      return {
        index: row.index,
        kind: row.kind,
        parent_banger_index: row.parentBangerIndex,
        tweet_id: row.tweetId,
        ...(candidate
          ? {
              source_rank: candidate.sourceRank,
              archived_ca_quote_count: candidate.tweet.quoteCount ?? 0,
            }
          : {}),
        tweet: promptTweet(row.tweet),
      }
    }),
    null,
    2,
  )
  const rendered = template
    .replaceAll('{{digest_date}}', input.digestDate)
    .replaceAll('{{window_start}}', input.windowStart)
    .replaceAll('{{window_end}}', input.windowEnd)
    .replaceAll('{{candidate_json}}', candidateJson)

  if (!input.priorDigests?.length) return rendered

  const continuityContext = input.priorDigests.map((digest) => ({
    digest_date: digest.digestDate,
    executive_summary: digest.executiveSummary,
    story_titles: digest.storyTitles,
    keywords: digest.keywords,
  }))

  return `${rendered}\n\nPAST PUBLISHED DIGESTS (CONTINUITY CONTEXT)\n${JSON.stringify(continuityContext, null, 2)}\n\nUse this history only to preserve continuity, identify genuinely continuing threads, and avoid repetitive framing. Every factual claim and every selected tweet in today's digest must still be grounded in TODAY'S CURRENT CANDIDATE CORPUS above.`
}

export function renderDigestRevisionPrompt(input: {
  basePrompt: string
  instruction: string
  current: DigestEditionContent
}): string {
  const currentEdition = {
    executive_summary: input.current.executiveSummary,
    representative_tweet_id: input.current.topBanger.id,
    stories: input.current.stories.map((story) => ({
      category: story.category,
      title: story.title,
      subtitle: story.subtitle,
      bullets: story.bullets,
      editorial_note: story.editorialNote,
      tweet_ids: [...story.bangers, ...story.commentary].map(({ id }) => id),
    })),
    keywords: input.current.keywords,
  }

  return `${input.basePrompt}\n\nEDITORIAL REVISION REQUEST\n${input.instruction}\n\nCURRENT VALIDATED EDITION\n${JSON.stringify(currentEdition, null, 2)}\n\nRevise the current edition to satisfy the request while preserving everything the editor did not ask to change. Map the current tweet IDs back to zero-based indices in the supplied corpus. The revised response must still follow the full schema and source-grounding rules.`
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
  const corpus = buildDigestPromptCorpus(input.enrichedCandidates)
  const enrichedByBanger = new Map(
    input.enrichedCandidates.map((candidate) => [
      candidate.candidate.tweet.id,
      candidate,
    ]),
  )
  const slugCounts = new Map<string, number>()

  const stories: DigestStory[] = parsed.stories.map((story) => {
    const indexedTweets = story.tweetIndices.map((index) => corpus[index])
    const storyBangers = indexedTweets
      .filter(({ kind }) => kind === 'banger')
      .map(({ tweet }) => tweet)
    const storyCommentary = indexedTweets
      .filter(({ kind }) => kind !== 'banger')
      .map(({ tweet }) => tweet)
    const keyword =
      parsed.keywords.find((item) =>
        indexedTweets.some(({ tweet }) =>
          normalizedExcerpt(tweet.text).includes(normalizedExcerpt(item)),
        ),
      ) ?? story.title.slice(0, 60)
    const baseSlug = slugify(story.title)
    const occurrence = (slugCounts.get(baseSlug) ?? 0) + 1
    slugCounts.set(baseSlug, occurrence)
    const related = storyBangers
      .map(({ id }) => id)
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
      keyword,
      title: story.title,
      titleIsQuote: titleOccursInOnePost(story.title, indexedTweets),
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

  const topBanger = corpus[parsed.representativeTweetIndex]?.tweet
  if (!topBanger) throw new Error('Digest has no representative tweet')

  return {
    digestDate: input.digestDate,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    executiveSummary: parsed.executiveSummary,
    editorialWarnings: parsed.editorialWarnings,
    topBanger,
    stories,
    keywords: parsed.keywords,
    source: {
      candidateCount: input.allCandidateCount,
      selectedCount: input.enrichedCandidates.length,
      runId: input.runId,
    },
  }
}
