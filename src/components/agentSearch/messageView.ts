// Pure message-to-view logic for Ask the archive. The page renders whatever
// these functions return, so the tests here cover what members actually see:
// progress lines, citation numbering, unverified ids, and the coverage note.

import type { UIMessage } from 'ai'
import { CITATION_PATTERN } from '@/lib/agentSearch/citations'
import type { PortalQuotedTweet, PortalTweet } from '@/lib/portal/types'

export const NOT_SEARCHED_LINE =
  "Not searched: live X, people who never joined the archive (except in members' threads), deleted posts"

/** A classifier probability at or above this counts as kept (spec: p >= 0.5). */
const KEPT_P = 0.5

export interface ToolCallView {
  id: string
  name: string
  state: string
  input: Record<string, unknown>
  output: unknown
  errorText?: string
}

export interface ProgressLine {
  id: string
  text: string
  status: 'running' | 'done' | 'error'
}

export interface Citation {
  id: string
  n: number
  tweet: PortalTweet
  anchor: string
}

export interface AnswerView {
  /** Answer markdown with each marker rewritten to a citation-chip link. */
  markdown: string
  citations: Citation[]
  unverified: string[]
}

export interface CoverageSearch {
  label: string
  detail: string
}

export interface CoverageView {
  searches: CoverageSearch[]
  scored: number
  kept: number
  threadsRead: number
  quotesRead: number
}

export interface TurnView {
  progress: ProgressLine[]
  answer: AnswerView
  otherTweets: PortalTweet[]
  coverage: CoverageView
}

type LooseRecord = Record<string, unknown>

const isRecord = (value: unknown): value is LooseRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : []

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const quote = (value: string) => `“${value}”`

const plural = (n: number, word: string) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? word : `${word}s`}`

const keptCount = (items: unknown[]) =>
  items.filter((item) => isRecord(item) && (asNumber(item.p) ?? 0) >= KEPT_P)
    .length

/** The tool returns at most 60 kept posts; keptCount is the true total. */
const collectKept = (out: LooseRecord) =>
  asNumber(out.keptCount) ?? asArray(out.kept).length

/** Tool parts arrive as `tool-<name>` (static) or `dynamic-tool` with toolName. */
export function toolCalls(message: UIMessage): ToolCallView[] {
  const calls: ToolCallView[] = []
  for (const part of message.parts) {
    const record = part as unknown as LooseRecord
    const type = String(record.type)
    let name: string | undefined
    if (type === 'dynamic-tool') name = asString(record.toolName)
    else if (type.startsWith('tool-')) name = type.slice('tool-'.length)
    if (!name) continue
    calls.push({
      id: asString(record.toolCallId) ?? `${name}-${calls.length}`,
      name,
      state: String(record.state ?? 'input-streaming'),
      input: isRecord(record.input) ? record.input : {},
      output: record.state === 'output-available' ? record.output : undefined,
      errorText: asString(record.errorText),
    })
  }
  return calls
}

function searchSubject(input: LooseRecord): string {
  const query = asString(input.query)
  const from = asString(input.fromUser)
  const replyTo = asString(input.replyToUser)
  const parts = [query ? quote(query) : 'posts']
  if (from) parts.push(`from @${from.replace(/^@/, '')}`)
  if (replyTo) parts.push(`replying to @${replyTo.replace(/^@/, '')}`)
  return parts.join(' ')
}

function termsSubject(input: LooseRecord): string {
  const terms = asArray(input.terms)
    .map(asString)
    .filter((term): term is string => Boolean(term))
  const from = asString(input.fromUser)
  const subject = terms.length ? terms.map(quote).join(', ') : 'posts'
  return from ? `${subject} from @${from.replace(/^@/, '')}` : subject
}

const CRITERION_LIMIT = 140

function criterionText(input: LooseRecord): string {
  const criterion = asString(input.criterion)
  if (!criterion) return ''
  return criterion.length > CRITERION_LIMIT
    ? `${criterion.slice(0, CRITERION_LIMIT).trimEnd()}…`
    : criterion
}

/** Mirrors DEFAULT_COLLECT in toolImpl: the limit when the agent sets none. */
const DEFAULT_COLLECT = 300

export function progressLine(call: ToolCallView): ProgressLine {
  const { input, output } = call
  const out = isRecord(output) ? output : {}
  const done = call.state === 'output-available'
  const failed = call.state === 'output-error'
  let running: string
  let finished: string
  let failure: string

  switch (call.name) {
    case 'find_people': {
      const q = asString(input.query)
      running = `Looking up ${q ? quote(q) : 'people'}`
      finished = `Looked up ${q ? quote(q) : 'people'} · ${plural(
        asArray(out.members).length,
        'member',
      )}`
      failure = `Could not look up ${q ? quote(q) : 'people'}`
      break
    }
    case 'search_tweets': {
      const subject = searchSubject(input)
      running = `Searching ${subject}`
      finished = `Searched ${subject} · ${plural(
        asArray(out.tweets).length,
        'tweet',
      )}`
      failure = `Search for ${subject} failed`
      break
    }
    case 'collect_and_score': {
      const subject = termsSubject(input)
      const criterion = criterionText(input)
      const limit =
        asNumber(out.limit) ?? asNumber(input.maxTweets) ?? DEFAULT_COLLECT
      const question = criterion ? ` against ${quote(criterion)}` : ''
      running = `Checking up to ${plural(limit, 'post')} matching ${subject}${question}`
      finished = `Checked ${plural(asNumber(out.scored) ?? 0, 'post')} matching ${subject} · ${collectKept(
        out,
      )} kept${out.capped ? ` · stopped at the ${limit.toLocaleString('en-US')}-post limit` : ''}`
      failure = `Checking posts matching ${subject} failed`
      break
    }
    case 'score_tweets': {
      const scored = asArray(out.scored)
      const count = asArray(input.tweetIds).length
      running = count ? `Scoring ${plural(count, 'post')}` : 'Scoring posts'
      finished = `Scored ${plural(scored.length, 'post')} · ${keptCount(
        scored,
      )} kept`
      failure = 'Scoring posts failed'
      break
    }
    case 'get_thread': {
      running = 'Reading thread'
      finished = out.notFound
        ? 'Thread not found'
        : `Read thread · ${plural(asArray(out.conversation).length, 'post')}`
      failure = 'Could not read thread'
      break
    }
    case 'get_quote_posts': {
      running = 'Reading quotes'
      finished = `Read quotes · ${plural(asArray(out.tweets).length, 'post')}`
      failure = 'Could not read quotes'
      break
    }
    case 'get_tweets': {
      running = 'Fetching posts'
      finished = `Fetched ${plural(asArray(out.tweets).length, 'post')}`
      failure = 'Could not fetch posts'
      break
    }
    default:
      running = `Running ${call.name}`
      finished = `Ran ${call.name}`
      failure = `${call.name} failed`
  }

  return {
    id: call.id,
    text: failed ? failure : done ? finished : running,
    status: failed ? 'error' : done ? 'done' : 'running',
  }
}

export function progressLines(message: UIMessage): ProgressLine[] {
  return toolCalls(message).map(progressLine)
}

export interface FoundTweets {
  /** Every tweet id in tool outputs, embedded quoted tweets included. */
  byId: Map<string, PortalTweet>
  /** Ids returned as results (not only as someone's quoted tweet), in order. */
  results: string[]
  /** Highest classifier probability seen per id. */
  scores: Map<string, number>
}

function quotedAsPortal(tweet: PortalQuotedTweet): PortalTweet {
  return { ...tweet, observedAt: tweet.createdAt }
}

/** find_people top tweets carry only id, date, text and likes. */
function profileTweets(profile: LooseRecord, items: unknown): PortalTweet[] {
  const username = asString(profile.username)
  if (!username) return []
  return asArray(items).flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string') return []
    if (typeof item.text !== 'string') return []
    const createdAt = asString(item.createdAt) ?? ''
    return [
      {
        id: item.id,
        username,
        name: asString(profile.displayName) ?? username,
        avatar: null,
        text: item.text,
        observedAt: createdAt,
        createdAt,
        likes: asNumber(item.likes) ?? 0,
        rts: 0,
        retweetCountAvailable: false,
      },
    ]
  })
}

/**
 * Same traversal as collectToolTweetIds, but keeps the objects so the page can
 * render cited tweets without another fetch. Full tweets win over quoted embeds.
 */
export function collectToolTweets(outputs: unknown[]): FoundTweets {
  const byId = new Map<string, PortalTweet>()
  const full = new Set<string>()
  const results: string[] = []
  const scores = new Map<string, number>()

  const visit = (value: unknown, embedded: boolean) => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, embedded))
      return
    }
    if (!isRecord(value)) return
    if (
      typeof value.id === 'string' &&
      /^\d{1,20}$/.test(value.id) &&
      typeof value.text === 'string' &&
      typeof value.username === 'string'
    ) {
      const id = value.id
      const isFull = typeof value.observedAt === 'string'
      if (isFull && !full.has(id)) {
        byId.set(id, value as unknown as PortalTweet)
        full.add(id)
      } else if (!byId.has(id)) {
        byId.set(
          id,
          isFull
            ? (value as unknown as PortalTweet)
            : quotedAsPortal(value as unknown as PortalQuotedTweet),
        )
      }
      if (!embedded && !results.includes(id)) results.push(id)
      const p = asNumber(value.p)
      if (p !== undefined) scores.set(id, Math.max(p, scores.get(id) ?? 0))
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'topTweets') {
        // A profile's all-time top tweets are context, not search results,
        // and arrive without author fields. Keep them citable, never listed.
        visit(profileTweets(value, child), true)
        continue
      }
      visit(child, embedded || key === 'quotedTweet')
    }
  }

  outputs.forEach((output) => visit(output, false))
  return { byId, results, scores }
}

export function citationAnchor(scope: string, tweetId: string) {
  return `ask-${scope}-tweet-${tweetId}`
}

export const UNVERIFIED_HREF_PREFIX = '#ask-unverified-'

/** A partial marker at the end of a streaming answer would flash as raw text. */
function trimPartialMarker(text: string) {
  return text.replace(/\[(?:\[(?:t(?::\d*)?)?)?\]?$/, '')
}

/**
 * Numbers citations in order of first appearance and rewrites each marker as a
 * markdown link the renderer turns into a chip. Ids absent from every tool
 * output are unverified: the model named them, the tools never returned them.
 */
export function buildAnswer(
  text: string,
  found: FoundTweets,
  scope: string,
  options: { streaming?: boolean } = {},
): AnswerView {
  const source = options.streaming ? trimPartialMarker(text) : text
  const citations: Citation[] = []
  const unverified: string[] = []
  const markdown = source.replace(
    new RegExp(CITATION_PATTERN.source, 'g'),
    (_marker, id: string, offset: number) => {
      // Chips need a gap from the word or chip before them, but no double space.
      const gap = offset > 0 && !/\s/.test(source[offset - 1]) ? ' ' : ''
      const tweet = found.byId.get(id)
      if (!tweet) {
        if (!unverified.includes(id)) unverified.push(id)
        return `${gap}[unverified](${UNVERIFIED_HREF_PREFIX}${id})`
      }
      let citation = citations.find((item) => item.id === id)
      if (!citation) {
        citation = {
          id,
          n: citations.length + 1,
          tweet,
          anchor: citationAnchor(scope, id),
        }
        citations.push(citation)
      }
      return `${gap}[${citation.n}](#${citation.anchor})`
    },
  )
  return { markdown, citations, unverified }
}

export function buildCoverage(calls: ToolCallView[]): CoverageView {
  const coverage: CoverageView = {
    searches: [],
    scored: 0,
    kept: 0,
    threadsRead: 0,
    quotesRead: 0,
  }
  for (const call of calls) {
    if (call.state !== 'output-available') continue
    const out = isRecord(call.output) ? call.output : {}
    switch (call.name) {
      case 'search_tweets':
        coverage.searches.push({
          label: searchSubject(call.input),
          detail: plural(asArray(out.tweets).length, 'tweet'),
        })
        break
      case 'collect_and_score': {
        const collected = asNumber(out.collected) ?? 0
        const scored = asNumber(out.scored) ?? 0
        const kept = collectKept(out)
        coverage.searches.push({
          label: termsSubject(call.input),
          detail: `${plural(collected, 'post')} checked${
            out.capped ? ' (stopped at the limit, more exist)' : ''
          }, ${kept} kept`,
        })
        coverage.scored += scored
        coverage.kept += kept
        break
      }
      case 'score_tweets': {
        const scored = asArray(out.scored)
        coverage.scored += scored.length
        coverage.kept += keptCount(scored)
        break
      }
      case 'get_thread':
        if (!out.notFound) coverage.threadsRead += 1
        break
      case 'get_quote_posts':
        coverage.quotesRead += 1
        break
    }
  }
  return coverage
}

export function messageText(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
}

/**
 * The answer is the text after the last tool call; earlier text is the
 * model thinking aloud between searches. Falls back to all text.
 */
export function answerText(message: UIMessage): string {
  const parts = message.parts
  let lastTool = -1
  parts.forEach((part, index) => {
    if (part.type === 'dynamic-tool' || part.type.startsWith('tool-'))
      lastTool = index
  })
  const after = parts
    .slice(lastTool + 1)
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
  return after.trim() ? after : messageText(message)
}

/**
 * Builds the view for the assistant message at `index`. Citations resolve
 * against tool outputs from this and earlier turns, since a follow-up answer
 * may cite tweets the agent found for an earlier question.
 */
export function buildTurnView(
  messages: UIMessage[],
  index: number,
  options: { streaming?: boolean } = {},
): TurnView {
  const message = messages[index]
  const calls = toolCalls(message)
  const priorOutputs = messages
    .slice(0, index)
    .filter((item) => item.role === 'assistant')
    .flatMap((item) => toolCalls(item).map((call) => call.output))
  const ownOutputs = calls.map((call) => call.output)
  const found = collectToolTweets([...ownOutputs, ...priorOutputs])
  const own = collectToolTweets(ownOutputs)
  const answer = buildAnswer(answerText(message), found, message.id, options)
  const cited = new Set(answer.citations.map((citation) => citation.id))
  const otherTweets = orderByScore(
    own.results.filter((id) => !cited.has(id)),
    own.scores,
  ).map((id) => own.byId.get(id) as PortalTweet)

  return {
    progress: calls.map(progressLine),
    answer,
    otherTweets,
    coverage: buildCoverage(calls),
  }
}

/** Scored posts first, highest probability first; the rest keep search order. */
function orderByScore(ids: string[], scores: Map<string, number>) {
  return ids
    .map((id, position) => ({ id, position, p: scores.get(id) }))
    .sort((a, b) => {
      if (a.p !== undefined && b.p !== undefined && a.p !== b.p)
        return b.p - a.p
      if (a.p !== undefined && b.p === undefined) return -1
      if (a.p === undefined && b.p !== undefined) return 1
      return a.position - b.position
    })
    .map((item) => item.id)
}

const ERROR_MESSAGES: Record<string, string> = {
  daily_limit:
    "You've used today's 10 questions. You can ask again after midnight UTC.",
  run_in_progress:
    'Your previous question is still running. Wait for it to finish, then ask again.',
  global_budget:
    'Ask the archive has reached its spending limit for today. Try again tomorrow.',
  not_eligible:
    'Ask the archive is for members who have uploaded their archive.',
}

/**
 * WorkflowChatTransport throws `Failed to fetch chat: <status> <body>` for a
 * non-2xx POST, so the status and JSON error code are parsed from the message.
 */
export function describeChatError(error: Error | undefined): string | null {
  if (!error) return null
  const match = /Failed to fetch chat: (\d{3}) ?([\s\S]*)$/.exec(error.message)
  if (!match) {
    return 'The answer stopped before it finished. Try asking again.'
  }
  const status = Number(match[1])
  let code: string | undefined
  try {
    const body = JSON.parse(match[2]) as unknown
    if (isRecord(body)) code = asString(body.error)
  } catch {
    code = undefined
  }
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (status === 401) return 'Sign in to ask a question.'
  if (status === 403) return ERROR_MESSAGES.not_eligible
  if (status === 429) return 'You have reached a usage limit. Try again later.'
  if (status === 400)
    return 'That question could not be sent. Check it and try again.'
  return 'The archive search is not responding right now. Try again in a few minutes.'
}
