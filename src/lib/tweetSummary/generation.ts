// Pure eligibility check, prompt, and output validation for the generated
// titles and summaries on archive permalink pages.

import { plainTweetText, type TweetPageSubject } from './subject'

export const SUMMARY_MODEL = 'deepseek/deepseek-v4.1-flash'
// Bump when the model, prompt, or validation changes enough to warrant
// regeneration.
export const SUMMARY_PROMPT_VERSION = 8

export interface GeneratedSummary {
  title: string
  description: string
}

export type SummaryOutcome =
  | ({ eligible: true } & GeneratedSummary)
  | { eligible: false; reason: string }

// Words that carry no idea on their own: reactions and greetings.
const REACTION_WORDS = new Set(
  (
    'lol lmao lmfao rofl haha hahaha hah heh lolol yes yeah yep yup no nope nah ok okay ' +
    'k kk thanks thank thx ty you u gm gn good morning night hi hello hey wow omg ' +
    'same this that these so very really true real based nice cool great love it ' +
    'congrats congratulations amazing awesome beautiful lovely agreed agree exactly ' +
    'indeed absolutely totally definitely mood big oof yikes damn dang wild crazy ' +
    'lfg ngl tbh fr idk'
  ).split(' '),
)

const WORD = /\p{L}[\p{L}\p{N}'’-]*/gu

/**
 * Cheap gate before any model call. It only rejects text with almost no
 * words beyond reactions or greetings; the model makes the finer call, so a
 * terse but substantive line still gets a chance. Quoted tweets are context,
 * not content: a "lol" quote of a long post is still a reaction.
 */
export function precheckEligibility(
  subject: TweetPageSubject,
): { eligible: true } | { eligible: false; reason: string } {
  const text = subject.chain
    .map((t) => plainTweetText(t.text))
    .join(' ')
    .replace(/(?:^|\s)@\w+/g, ' ')
  const meaningful = (text.match(WORD) ?? []).filter(
    (word) => !REACTION_WORDS.has(word.toLowerCase()),
  )
  if (meaningful.length < 3) return { eligible: false, reason: 'low-content' }
  return { eligible: true }
}

const SYSTEM_PROMPT = `You write the headline and summary for one page of Community Archive, a public archive of tweets. The page shows the original tweet or thread directly below your text, so your job is editorial framing, not repetition.

Return JSON only: {"eligible": boolean, "title": string, "description": string}.

Most posts are eligible: an idea, argument, observation, satire with a clear target, personal reflection, story, question, or announcement can all be summarized, even when short. Set "eligible" to false, with empty strings, only when there is nothing to summarize without guessing: bare reactions or greetings, a link or image with little or no text, or a remark that means nothing without context the page does not show.

When eligible:
- "title": a headline of 5 to 12 words that states the central idea itself, like a magazine headline: "Rebuilding trust through repetition", "Focus on what you want to see more of". Sentence case, no trailing period, no quotation marks, no hashtags or emoji. Editorial, not clickbait. Do not open with "A" or "An" plus a genre word (reflection, critique, argument, call, defense, announcement); that framing belongs in the description. Do not copy the tweet's wording mechanically. Name the author only when the post announces their own work.
- "description": 1 to 3 sentences, 30 to 60 words, never more. Summarize the idea and, for a thread or conversation, how the surrounding replies develop it. Refer to the writer as "the author" and others as "replies" or "the conversation". Start with a noun phrase such as "A reflection on…", "An argument that…", or "A thread exploring…", never with "This tweet" or "In this thread".
- You cannot see attached images or videos. Never describe or characterize them; if the post is mainly about its media and the text alone says little, it is not eligible.
- Stay strictly within what the text says. No invented context, no claims about motives or reception, no sensational adjectives, no filler like "thought-provoking" or "insightful".`

function formatTweet(tweet: TweetPageSubject['chain'][number], marker = '') {
  const media = tweet.media?.length
    ? ` [${tweet.media.length} attached ${tweet.media.length === 1 ? tweet.media[0] : 'media items'}, not shown]`
    : ''
  const quoted = tweet.quoted
    ? `\n  [quoting @${tweet.quoted.username}: ${plainTweetText(tweet.quoted.text).slice(0, 500)}]`
    : ''
  return `${marker}@${tweet.username}: ${plainTweetText(tweet.text).slice(0, 1200)}${media}${quoted}`
}

export function buildSummaryPrompt(subject: TweetPageSubject): {
  system: string
  user: string
} {
  const chain = subject.chain
    .map((tweet, index) =>
      formatTweet(
        tweet,
        `${index + 1}. ${tweet.tweet_id === subject.highlightId && subject.chain.length > 1 ? '(linked tweet) ' : ''}`,
      ),
    )
    .join('\n')
  const context = subject.context.length
    ? `\n\nOther replies, for context only:\n${subject.context
        .map((tweet) => formatTweet(tweet, '- '))
        .join('\n')}`
    : ''
  const heading =
    subject.kind === 'thread' ? 'Connected thread, in order:' : 'Tweet:'
  return { system: SYSTEM_PROMPT, user: `${heading}\n${chain}${context}` }
}

// The prompt's own examples; a model that echoes them has not read the tweet.
const PROMPT_ECHOES = [
  'rebuilding trust through repetition',
  'focus on what you want to see more of',
]

const wordCount = (text: string) => (text.match(/\S+/g) ?? []).length

function cleanTitle(value: string): string {
  return value
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .replace(/[.。]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// "A defense of X" frames the post instead of stating its idea.
const GENRE_OPENER =
  /^(?:an?|the)\s+(?:\w+\s+)?(?:defen[cs]e|reflection|critique|argument|case|meditation|exploration|warning|plea|observation|musing|rumination)s?\s+(?:of|on|for|that|about|against)\s+/i

export function hasGenreOpener(title: string): boolean {
  return GENRE_OPENER.test(title)
}

/** Last resort when a retry still frames: "A defense of X" becomes "X". */
export function stripGenreOpener(title: string): string {
  const stripped = title.replace(GENRE_OPENER, '')
  return stripped.charAt(0).toUpperCase() + stripped.slice(1)
}

/** Follow-up instruction after a draft title that framed instead of stating. */
export function titleCorrection(title: string): string {
  return `A previous draft title was "${title}". Do not open the title with that kind of framing ("A defense of…", "A reflection on…"). Write a headline that states the idea itself. Keep the same JSON shape.`
}

/** Validates model JSON; anything malformed or off-brief is rejected. */
export function parseSummaryOutput(raw: unknown): SummaryOutcome | null {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record.eligible === false) return { eligible: false, reason: 'model' }
  if (record.eligible !== true) return null
  if (
    typeof record.title !== 'string' ||
    typeof record.description !== 'string'
  )
    return null

  const title = cleanTitle(record.title)
  const description = record.description.trim().replace(/\s+/g, ' ')
  const titleWords = wordCount(title)
  const descriptionWords = wordCount(description)
  if (titleWords < 3 || titleWords > 14 || title.length > 100) return null
  // The brief asks for 30–60 words; allow some slack before rejecting.
  if (
    descriptionWords < 15 ||
    descriptionWords > 75 ||
    description.length > 520
  )
    return null
  if (/[#\u{1F300}-\u{1FAFF}]/u.test(title)) return null
  if (/^(this|in this) (tweet|thread)\b/i.test(description)) return null
  if (PROMPT_ECHOES.includes(title.toLowerCase())) return null
  return { eligible: true, title, description }
}
