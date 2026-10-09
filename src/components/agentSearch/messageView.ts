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

/** An agent-chosen heading over some of the posts it found. */
export interface EvidenceGroup {
  label: string
  tweets: PortalTweet[]
}

/** The counts behind "Based on 16 cited posts · 99 more judged relevant". */
export interface ReceiptView {
  cited: number
  /** Judged relevant and not cited, including posts the tools did not return. */
  relevant: number
  other: number
  searches: number
  scorerRan: boolean
  /** The post limit a check stopped at, when one did. */
  cappedAt: number | null
}

/** How a saved turn ended; a live stop is tracked by the page instead. */
export type TurnOutcome = 'done' | 'stopped' | 'failed'

export interface TurnView {
  outcome: TurnOutcome
  progress: ProgressLine[]
  answer: AnswerView
  /** Found posts judged relevant (p >= 0.5) that the answer does not cite. */
  relevant: PortalTweet[]
  /** Judged relevant but not returned to the page (each check returns 60). */
  relevantNotShown: number
  /** Every other search hit: not scored, or scored below the threshold. */
  otherMatches: PortalTweet[]
  /** Agent-chosen grouping of the relevant posts, when the run supplies one. */
  groups: EvidenceGroup[] | null
  receipt: ReceiptView
  coverage: CoverageView
  /** Distinct posts this turn's finished tool calls returned. */
  foundSoFar: number
  /** The best few of those, for the side column while the answer is written. */
  topFound: PortalTweet[]
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

/** 0:07, 1:32, 12:05. */
export function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

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

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) ? dayFormat.format(date) : value
}

/** "2023", "since 3 Jan 2023", "3 Jan to 5 Mar 2023"-style ranges. */
export function dateRangeLabel(
  since: string | undefined,
  until: string | undefined,
): string | null {
  const from = since && DATE_ONLY.test(since) ? since : undefined
  const to = until && DATE_ONLY.test(until) ? until : undefined
  if (from && to) {
    const [, fromYear, fromMonth, fromDay] = DATE_ONLY.exec(from) ?? []
    const [, toYear, toMonth, toDay] = DATE_ONLY.exec(to) ?? []
    if (fromYear === toYear && fromMonth === '01' && fromDay === '01') {
      if (toMonth === '12' && toDay === '31') return fromYear
    }
    // Searches often end on the first of the next year.
    if (
      fromMonth === '01' &&
      fromDay === '01' &&
      toMonth === '01' &&
      toDay === '01' &&
      Number(toYear) === Number(fromYear) + 1
    ) {
      return fromYear
    }
    return `${formatDay(from)} to ${formatDay(to)}`
  }
  if (from) return `since ${formatDay(from)}`
  if (to) return `before ${formatDay(to)}`
  return null
}

const SORT_LABELS: Record<string, string> = {
  oldest: 'oldest first',
  likes: 'most liked',
  reposts: 'most reposted',
}

const handle = (value: string) => `@${value.replace(/^@/, '')}`

/** Date range, order and paging, so repeated searches read as different. */
function searchQualifiers(input: LooseRecord): string[] {
  const qualifiers: string[] = []
  const range = dateRangeLabel(asString(input.since), asString(input.until))
  if (range) qualifiers.push(range)
  const sort = asString(input.sort)
  if (sort && SORT_LABELS[sort]) qualifiers.push(SORT_LABELS[sort])
  if ((asNumber(input.offset) ?? 0) > 0) qualifiers.push('more results')
  return qualifiers
}

/** Null when the search has neither words nor people: a plain browse. */
export function searchSubject(input: LooseRecord): string | null {
  const words = [asString(input.query), ...asArray(input.anyOf).map(asString)]
    .filter((word): word is string => Boolean(word))
    .filter((word, index, all) => all.indexOf(word) === index)
  const from = asString(input.fromUser)
  const replyTo = asString(input.replyToUser)
  const people: string[] = []
  if (from) people.push(`from ${handle(from)}`)
  if (replyTo) people.push(`replying to ${handle(replyTo)}`)
  if (!words.length && !people.length) return null
  const head = [words.length ? words.map(quote).join(', ') : 'posts', ...people]
  return [head.join(' '), ...searchQualifiers(input)].join(', ')
}

function termsSubject(input: LooseRecord): string {
  const terms = asArray(input.terms)
    .map(asString)
    .filter((term): term is string => Boolean(term))
  const from = asString(input.fromUser)
  const subject = terms.length ? terms.map(quote).join(', ') : 'posts'
  const range = dateRangeLabel(asString(input.since), asString(input.until))
  return [from ? `${subject} from ${handle(from)}` : subject, range]
    .filter(Boolean)
    .join(', ')
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
      const tweets = plural(asArray(out.tweets).length, 'tweet')
      if (subject) {
        running = `Searching ${subject}`
        finished = `Searched ${subject} · ${tweets}`
        failure = `Search for ${subject} failed`
      } else {
        const qualifiers = searchQualifiers(input)
        const what = qualifiers.length
          ? `posts, ${qualifiers.join(', ')}`
          : 'recent posts'
        running = `Browsing ${what}`
        finished = `Browsed ${what} · ${tweets}`
        failure = `Browsing ${what} failed`
      }
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
          label: searchSubject(call.input) ?? 'recent posts',
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
  const text = answerText(message)
  const outcome = turnOutcome(text)
  const answer = buildAnswer(
    outcome === 'done' ? text : '',
    found,
    message.id,
    options,
  )
  const cited = new Set(answer.citations.map((citation) => citation.id))
  const uncited = orderByScore(
    own.results.filter((id) => !cited.has(id)),
    own.scores,
  )
  const isRelevant = (id: string) => (own.scores.get(id) ?? 0) >= KEPT_P
  const tweetFor = (id: string) => own.byId.get(id) as PortalTweet
  const relevant = uncited.filter(isRelevant).map(tweetFor)
  const otherMatches = uncited.filter((id) => !isRelevant(id)).map(tweetFor)

  let relevantNotShown = 0
  let searches = 0
  let cappedAt: number | null = null
  for (const call of calls) {
    if (call.state !== 'output-available') continue
    const out = isRecord(call.output) ? call.output : {}
    if (call.name === 'search_tweets') searches += 1
    if (call.name === 'collect_and_score') {
      searches += 1
      relevantNotShown += Math.max(
        0,
        collectKept(out) - asArray(out.kept).length,
      )
      if (out.capped) {
        cappedAt = asNumber(out.limit) ?? asNumber(call.input.maxTweets) ?? DEFAULT_COLLECT
      }
    }
  }

  return {
    outcome,
    progress: calls.map(progressLine),
    answer,
    relevant,
    relevantNotShown,
    otherMatches,
    groups: evidenceGroups(message, found),
    receipt: {
      cited: answer.citations.length,
      relevant: relevant.length + relevantNotShown,
      other: otherMatches.length,
      searches,
      scorerRan: own.scores.size > 0,
      cappedAt,
    },
    coverage: buildCoverage(calls),
    foundSoFar: own.results.length,
    topFound: orderByScore(own.results, own.scores)
      .slice(0, TOP_FOUND)
      .map(tweetFor),
  }
}

const TOP_FOUND = 3

// A saved run that ended without an answer is closed with one of these
// lines (history.ts); the page shows its own banner instead.
const STOPPED_CLOSING = /^_?This answer was stopped before it finished\._?$/
const FAILED_CLOSING = /^_?This answer failed before it finished\._?$/

function turnOutcome(text: string): TurnOutcome {
  const trimmed = text.trim()
  if (STOPPED_CLOSING.test(trimmed)) return 'stopped'
  if (FAILED_CLOSING.test(trimmed)) return 'failed'
  return 'done'
}

/**
 * Optional grouping the agent may attach as message metadata:
 * `{ groups: [{ label, tweetIds }] }`. Ids the tools never returned are
 * dropped, and an empty result means no grouping.
 */
function evidenceGroups(
  message: UIMessage,
  found: FoundTweets,
): EvidenceGroup[] | null {
  const metadata = isRecord(message.metadata) ? message.metadata : {}
  const groups = asArray(metadata.groups).flatMap((group) => {
    if (!isRecord(group)) return []
    const label = asString(group.label)
    if (!label) return []
    const tweets = asArray(group.tweetIds)
      .map((id) => (typeof id === 'string' ? found.byId.get(id) : undefined))
      .filter((tweet): tweet is PortalTweet => Boolean(tweet))
    return tweets.length ? [{ label, tweets }] : []
  })
  return groups.length ? groups : null
}

export type ReceiptTarget = 'cited' | 'relevant' | 'other'

/** One line under the question; each count can link to its tier. */
export function receiptSegments(
  receipt: ReceiptView,
): Array<{ text: string; target: ReceiptTarget | null }> {
  const segments: Array<{ text: string; target: ReceiptTarget | null }> = [
    receipt.cited
      ? { text: `Based on ${plural(receipt.cited, 'cited post')}`, target: 'cited' }
      : { text: 'No posts cited', target: null },
  ]
  if (receipt.scorerRan && receipt.relevant) {
    segments.push({
      text: `${receipt.relevant.toLocaleString('en-US')} more judged relevant`,
      target: 'relevant',
    })
  }
  if (receipt.other) {
    const matches = `${receipt.other.toLocaleString('en-US')} other ${
      receipt.other === 1 ? 'match' : 'matches'
    }`
    segments.push({
      text:
        !receipt.scorerRan && receipt.searches
          ? `${matches} from ${receipt.searches} ${
              receipt.searches === 1 ? 'search' : 'searches'
            }`
          : matches,
      target: 'other',
    })
  }
  if (receipt.cappedAt) {
    segments.push({
      text: `stopped at the ${receipt.cappedAt.toLocaleString('en-US')}-post limit`,
      target: null,
    })
  }
  return segments
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
export function describeChatError(
  error: Error | undefined,
  quota?: { limit: number; resetLabel: string },
): string | null {
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
  if (code === 'daily_limit' && quota) {
    return `You’ve used today’s ${quota.limit} questions. You can ask again at ${quota.resetLabel}.`
  }
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (status === 401) return 'Sign in to ask a question.'
  if (status === 403) return ERROR_MESSAGES.not_eligible
  if (status === 429) return 'You have reached a usage limit. Try again later.'
  if (status === 400)
    return 'That question could not be sent. Check it and try again.'
  return 'The archive search is not responding right now. Try again in a few minutes.'
}
