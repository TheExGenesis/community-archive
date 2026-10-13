// Pure message-to-view logic for Ask the archive. The page renders whatever
// these functions return, so the tests here cover what members actually see:
// progress lines, citation numbering, unverified ids, and the coverage note.

import type { UIMessage } from 'ai'
import {
  CITATION_PATTERN,
  QUOTE_PATTERN,
  collectWorkspaceFiles,
  splitPostLists,
} from '@/lib/agentSearch/citations'
import type { ListView } from '@/lib/agentSearch/listView'
import type { PortalQuotedTweet, PortalTweet } from '@/lib/portal/types'
import { isVerbatim } from './quotes'

export const NOT_SEARCHED_LINE =
  "Not searched: live X, people who never joined the archive (except in members' threads), deleted tweets"

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
  /**
   * The same keyword search on the archive's search page, when the step was
   * one the page can express (no OR lists, no semantic or scoring steps).
   */
  searchHref?: string
}

/**
 * The step log in the order things happened: the model's reasoning as its
 * own entries between the steps it led to. Reasoning comes only from a live
 * or in-session stream; saved conversations keep none.
 */
export type TimelineEntry =
  | { kind: 'step'; line: ProgressLine }
  | {
      kind: 'thinking'
      id: string
      text: string
      /** No tool call has followed it yet: the step being worked out now. */
      latest: boolean
    }

/**
 * Why a tweet a tool returned is not in hand. A reopened conversation keeps
 * tweets as references and fetches them again: `loading` until its batch
 * lands, `failed` when the batch could not be fetched (the reader can retry),
 * `unavailable` when the gateway had nothing for it (deleted, or the author
 * opted out since). None of these is "unverified", which is a citation the
 * searches never returned at all.
 */
export type TweetLoad = 'loading' | 'failed' | 'unavailable'

export type CitationState = 'loaded' | TweetLoad

/** Tweets fetched so far for a reopened conversation, and why others are not. */
export interface TweetSupply {
  tweets: ReadonlyMap<string, PortalTweet>
  /** A referenced id absent from both is still loading. */
  states: ReadonlyMap<string, TweetLoad>
}

/** A cited tweet with its number; the tweet is null until it is in hand. */
export type Citation = {
  id: string
  n: number
  anchor: string
} & (
  | { tweet: PortalTweet; state: 'loaded' }
  | { tweet: null; state: TweetLoad }
)

/** Prose, or a list of posts the agent placed in the answer. */
export type AnswerBlock =
  | { kind: 'text'; markdown: string }
  | {
      kind: 'list'
      key: string
      /** Null for a list shown inside the prose, with no heading. */
      label: string | null
      tweets: PortalTweet[]
      /** How the agent chose to show it; the reader can switch. */
      view: ListView
      /** The relevance check's probability for the tweets it scored. */
      scores: ReadonlyMap<string, number>
      /** Listed tweets not in hand yet, in the list's order, with why. */
      pending: Array<{ id: string; state: TweetLoad }>
    }
  /** A citation alone on its line: the tweet shown whole, in place. */
  | { kind: 'tweet'; key: string; citation: Citation }

export interface AnswerView {
  /** The prose, each marker rewritten to a citation-chip link; no lists. */
  markdown: string
  /** The answer in order: prose blocks and post lists. */
  blocks: AnswerBlock[]
  citations: Citation[]
  /** Ids shown in the answer's post lists. */
  listed: string[]
  unverified: string[]
  /** Workspace files a list named that no tool reported. */
  missingLists: string[]
  /** Cited or listed tweets still being fetched. */
  loading: string[]
  /** Cited or listed tweets whose fetch failed; a retry may bring them. */
  failed: string[]
  /**
   * Cited or listed tweets the gateway no longer returns. The prose still
   * names their authors; this list is what a later change would use to
   * replace those mentions.
   */
  unavailable: string[]
  /**
   * Citations whose sentence names one person while the cited tweet is by
   * someone else: the model cited the wrong tweet. Each occurrence's chip
   * carries the same warning.
   */
  authorMismatches: AuthorMismatch[]
  /**
   * A reopened answer whose prose cited tweets that are no longer available
   * (deleted, or the author opted out): the prose is not shown, since it
   * still names and describes them. Lists keep what is still available.
   */
  withheld: boolean
  /**
   * A reopened answer whose cited tweets are still loading (or failed to):
   * its prose waits until they are confirmed available.
   */
  checking: boolean
}

export interface AuthorMismatch {
  id: string
  n: number
  /** The handle the sentence names, as written. */
  named: string
  /** The cited tweet's author. */
  author: string
}

export interface CoverageSearch {
  label: string
  detail: string
}

export interface CoverageView {
  searches: CoverageSearch[]
  scored: number
  /** Judged relevant (p >= 0.5). */
  kept: number
  /** A check stopped at its post limit, so more matching posts exist. */
  capped: boolean
  threadsRead: number
  quotesRead: number
  /** Names or handles looked up. */
  people: string[]
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
  /** Failed with every tool call failing: the archive search was down. */
  unavailable: boolean
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
  /**
   * A few of those for the side column while the answer is written: the
   * most relevant once the relevance check has scored some, before that the
   * latest command's matches.
   */
  topFound: FoundTweet[]
  /** Which of the two `topFound` holds, and what the reader is told. */
  foundPhase: FoundPhase
  /** The steps with the model's reasoning between them, in order. */
  timeline: TimelineEntry[]
  /**
   * Tweets this turn's tools returned that are not in hand (a reopened
   * conversation fetches them again): how many are still loading, failed,
   * or gone. Counts and lists grow as batches land.
   */
  tweets: { loading: number; failed: number; unavailable: number }
}

/** A tweet in the side column, with its relevance score once it has one. */
export interface FoundTweet {
  tweet: PortalTweet
  score?: number
}

export type FoundPhase =
  /** Nothing scored yet: the newest matches, from `source` (a step's words). */
  | { kind: 'latest'; source: string | null }
  /** The relevance check has run; `relevant` tweets cleared its threshold. */
  | { kind: 'relevant'; relevant: number }

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
type PartEntry =
  | { kind: 'reasoning'; text: string }
  | { kind: 'call'; call: ToolCallView }

// The message's reasoning and tool calls in stream order. Consecutive
// reasoning parts (one model step can stream several) read as one.
function readParts(message: UIMessage): PartEntry[] {
  const entries: PartEntry[] = []
  for (const part of message.parts) {
    const record = part as unknown as LooseRecord
    const type = String(record.type)
    if (type === 'reasoning') {
      const text = asString(record.text)
      if (!text) continue
      const last = entries[entries.length - 1]
      if (last?.kind === 'reasoning') last.text = `${last.text}\n\n${text}`
      else entries.push({ kind: 'reasoning', text })
      continue
    }
    let name: string | undefined
    if (type === 'dynamic-tool') name = asString(record.toolName)
    else if (type.startsWith('tool-')) name = type.slice('tool-'.length)
    if (!name) continue
    const calls = entries.filter((entry) => entry.kind === 'call').length
    entries.push({
      kind: 'call',
      call: {
        id: asString(record.toolCallId) ?? `${name}-${calls}`,
        name,
        state: String(record.state ?? 'input-streaming'),
        input: isRecord(record.input) ? record.input : {},
        output: record.state === 'output-available' ? record.output : undefined,
        errorText: asString(record.errorText),
      },
    })
  }
  return entries
}

export function toolCalls(message: UIMessage): ToolCallView[] {
  return readParts(message).flatMap((entry) =>
    entry.kind === 'call' ? [entry.call] : [],
  )
}

/**
 * The steps and the reasoning between them, in the order they streamed. A
 * retried call keeps its place at its first attempt, as its step line does.
 */
export function timelineFor(message: UIMessage): TimelineEntry[] {
  const entries = readParts(message)
  const calls = entries.flatMap((entry) =>
    entry.kind === 'call' ? [entry.call] : [],
  )
  const groups = groupCalls(calls)
  const lines = new Map(
    progressFor(calls).map((line) => [line.id, line] as const),
  )
  const lineOf = new Map<string, ProgressLine>()
  for (const group of groups) {
    const line = lines.get(group[0].id)
    if (line) for (const call of group) lineOf.set(call.id, line)
  }
  const placed = new Set<string>()
  const timeline: TimelineEntry[] = []
  entries.forEach((entry, index) => {
    if (entry.kind === 'reasoning') {
      timeline.push({
        kind: 'thinking',
        id: `thinking-${index}`,
        text: entry.text.trim(),
        latest: !entries.slice(index + 1).some((e) => e.kind === 'call'),
      })
      return
    }
    const line = lineOf.get(entry.call.id)
    if (!line || placed.has(line.id)) return
    placed.add(line.id)
    timeline.push({ kind: 'step', line })
  })
  return timeline
}

/**
 * The newest sentence of some reasoning, for a one-line live status: the
 * last sentence or line, even one still being written.
 */
export function latestThought(reasoning: string | undefined): string {
  const text = (reasoning ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const sentences = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [text]
  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentence = sentences[i].trim()
    // A fragment of a word or two reads better with the sentence before it.
    if (sentence.split(' ').length >= 3 || i === 0) return sentence
  }
  return text
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
  const head = [
    words.length ? words.map(quote).join(', ') : 'tweets',
    ...people,
  ]
  return [head.join(' '), ...searchQualifiers(input)].join(', ')
}

/** “query”, from @x: what a search by meaning looked for. */
function meaningSubject(input: LooseRecord): string {
  const query = asString(input.query)
  const from = asString(input.fromUser)
  const subject = query ? quote(query) : 'tweets'
  return from ? `${subject} from ${handle(from)}` : subject
}

function termsSubject(input: LooseRecord): string {
  const terms = asArray(input.terms)
    .map(asString)
    .filter((term): term is string => Boolean(term))
  const from = asString(input.fromUser)
  const subject = terms.length ? terms.map(quote).join(', ') : 'tweets'
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

const COMMAND_LIMIT = 80

/** One line of a shell command, cut to fit a step. */
function shortCommand(command: string) {
  const line = command.replace(/\s+/g, ' ').trim()
  return line.length > COMMAND_LIMIT
    ? `${line.slice(0, COMMAND_LIMIT).trimEnd()}…`
    : line || 'a command'
}

// The words of a shell segment, with quotes removed and options dropped.
function commandWords(segment: string): string[] {
  const words = Array.from(segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)).map(
    (match) => match[1] ?? match[2] ?? match[3],
  )
  const kept: string[] = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (word === '>' || word === '>>') break
    if (word.startsWith('--')) {
      // An option and its value: --limit 300, --from @x.
      if (
        !word.includes('=') &&
        words[i + 1] &&
        !words[i + 1].startsWith('-')
      ) {
        i++
      }
      continue
    }
    kept.push(word)
  }
  return kept
}

/**
 * What a running shell command is doing, in words: the first archive command
 * in it, or looking through files already found. Members never see the shell.
 */
export function describeCommand(command: string): string {
  const segments = command.split(/;|&&|\|\||\|/)
  for (const segment of segments) {
    const [name, ...rest] = commandWords(segment.trim())
    const text = rest.join(' ').trim()
    switch (name) {
      case 'search':
        return text ? `Searching ${quote(text)}` : 'Searching'
      case 'semantic':
        return text
          ? `Searching by meaning ${quote(text)}`
          : 'Searching by meaning'
      case 'people':
        return text ? `Looking up ${quote(text)}` : 'Looking up people'
      case 'score':
        return rest[1]
          ? `Checking tweets against ${quote(criterionText({ criterion: rest.slice(1).join(' ') }))}`
          : 'Checking tweets against your question'
      case 'thread':
        return 'Reading thread'
      case 'quotes':
        return 'Reading quotes'
      case 'read':
        return 'Reading a tweet in full'
      case 'tweets':
        return 'Collecting tweets'
    }
  }
  return 'Looking through the results'
}

const SEARCH_DATE = /^\d{4}-\d{2}-\d{2}$/
const PAGE_SORTS = new Set(['newest', 'oldest', 'likes', 'reposts'])

/** The archive search page's URL for a keyword search, or null. */
export function archiveSearchHref(search: {
  query?: string | null
  fromUser?: string | null
  replyToUser?: string | null
  since?: string | null
  until?: string | null
  sort?: string | null
}): string | null {
  const query = search.query?.trim()
  if (!query) return null
  const params = new URLSearchParams({ q: query })
  const from = search.fromUser?.trim().replace(/^@/, '')
  const replyTo = search.replyToUser?.trim().replace(/^@/, '')
  if (from) params.set('fromUser', from)
  if (replyTo) params.set('replyToUser', replyTo)
  for (const [key, value] of [
    ['sinceDate', search.since],
    ['untilDate', search.until],
  ] as const) {
    if (!value) continue
    if (!SEARCH_DATE.test(value)) return null
    params.set(key, value)
  }
  if (search.sort && search.sort !== 'newest') {
    if (!PAGE_SORTS.has(search.sort)) return null
    params.set('sort', search.sort)
  }
  return `/search?${params.toString()}`
}

// The workspace `search` command's options (workspace/commands.ts). --limit
// only caps how many come back and --all matches every word, as the search
// page does; --any (an OR list) has no equivalent there.
const SEARCH_VALUE_FLAGS = new Set([
  'any',
  'from',
  'reply-to',
  'since',
  'until',
  'sort',
  'limit',
])

/** The first `search` in a shell command the search page can express. */
export function bashSearchHref(command: string): string | null {
  for (const segment of command.split(/;|&&|\|\||\|/)) {
    const words = Array.from(
      segment.trim().matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g),
    ).map((match) => match[1] ?? match[2] ?? match[3])
    if (words[0] !== 'search') continue
    const terms: string[] = []
    const flags: Record<string, string> = {}
    let expressible = true
    for (let i = 1; i < words.length; i++) {
      const word = words[i]
      if (word === '>' || word === '>>') break
      if (!word.startsWith('--')) {
        terms.push(word)
        continue
      }
      const [name, inline] = word.slice(2).split(/=(.*)/s, 2)
      if (name === 'all') continue
      if (!SEARCH_VALUE_FLAGS.has(name) || name === 'any') {
        expressible = false
        break
      }
      const value = inline ?? words[++i]
      if (value === undefined) {
        expressible = false
        break
      }
      flags[name] = value
    }
    if (!expressible) continue
    const href = archiveSearchHref({
      query: terms.join(' '),
      fromUser: flags.from,
      replyToUser: flags['reply-to'],
      since: flags.since,
      until: flags.until,
      sort: flags.sort,
    })
    if (href) return href
  }
  return null
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
  let searchHref: string | null = null

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
      if (!asArray(input.anyOf).length) {
        searchHref = archiveSearchHref({
          query: asString(input.query),
          fromUser: asString(input.fromUser),
          replyToUser: asString(input.replyToUser),
          since: asString(input.since),
          until: asString(input.until),
          sort: asString(input.sort),
        })
      }
      const tweets = plural(asArray(out.tweets).length, 'tweet')
      if (subject) {
        running = `Searching ${subject}`
        finished = `Searched ${subject} · ${tweets}`
        failure = `Could not search ${subject}`
      } else {
        const qualifiers = searchQualifiers(input)
        const what = qualifiers.length
          ? `tweets, ${qualifiers.join(', ')}`
          : 'recent tweets'
        running = `Browsing ${what}`
        finished = `Browsed ${what} · ${tweets}`
        failure = `Could not browse ${what}`
      }
      break
    }
    case 'semantic_search': {
      const subject = meaningSubject(input)
      running = `Searching by meaning ${subject}`
      finished = `Searched by meaning ${subject} · ${plural(
        asArray(out.tweets).length,
        'tweet',
      )}`
      failure = `Could not search by meaning ${subject}`
      break
    }
    case 'collect_and_score': {
      const subject = termsSubject(input)
      const criterion = criterionText(input)
      const limit =
        asNumber(out.limit) ?? asNumber(input.maxTweets) ?? DEFAULT_COLLECT
      const question = criterion ? ` against ${quote(criterion)}` : ''
      running = `Checking up to ${plural(limit, 'tweet')} matching ${subject}${question}`
      finished = `Checked ${plural(asNumber(out.scored) ?? 0, 'tweet')} matching ${subject} · ${collectKept(
        out,
      )} relevant${out.capped ? ` · stopped at the ${limit.toLocaleString('en-US')}-tweet limit` : ''}`
      failure = `Could not check tweets matching ${subject}`
      break
    }
    case 'score_tweets': {
      const scored = asArray(out.scored)
      const count = asArray(input.tweetIds).length
      running = `Checking ${count ? plural(count, 'tweet') : 'tweets'} against your question`
      finished = `Checked ${plural(scored.length, 'tweet')} against your question · ${keptCount(
        scored,
      )} relevant`
      failure = 'Could not check tweets against your question'
      break
    }
    case 'get_thread': {
      running = 'Reading thread'
      finished = out.notFound
        ? 'Thread not found'
        : `Read thread · ${plural(asArray(out.conversation).length, 'tweet')}`
      failure = 'Could not read thread'
      break
    }
    case 'get_quote_posts': {
      running = 'Reading quotes'
      finished = `Read quotes · ${plural(asArray(out.tweets).length, 'tweet')}`
      failure = 'Could not read quotes'
      break
    }
    case 'get_tweets': {
      running = 'Fetching tweets'
      finished = `Fetched ${plural(asArray(out.tweets).length, 'tweet')}`
      failure = 'Could not fetch tweets'
      break
    }
    case 'bash': {
      // The workspace's shell: say what ran, and its own summary of what it
      // did, or the first line it printed.
      const command = shortCommand(asString(input.command) ?? '')
      const firstLine = (asString(out.stdout) ?? '')
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean)
      const doing = describeCommand(asString(input.command) ?? '')
      running = doing
      finished = asString(out.summary) ?? firstLine ?? `Ran ${command}`
      failure = `Could not finish: ${doing.charAt(0).toLowerCase()}${doing.slice(1)}`
      if (done && (asNumber(out.exitCode) ?? 0) !== 0) {
        return { id: call.id, text: failure, status: 'error' }
      }
      searchHref = bashSearchHref(asString(input.command) ?? '')
      break
    }
    default:
      running = `Running ${call.name}`
      finished = `Ran ${call.name}`
      failure = `Could not run ${call.name}`
  }

  return {
    id: call.id,
    text: failed ? failure : done ? finished : running,
    status: failed ? 'error' : done ? 'done' : 'running',
    ...(searchHref ? { searchHref } : {}),
  }
}

// Models fill unused optional fields with '' or []; two calls that differ only
// there are the same call.
function callKey(call: ToolCallView) {
  const meaningful = Object.keys(call.input)
    .sort()
    .filter((key) => {
      const value = call.input[key]
      return !(
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      )
    })
    .map((key) => [key, call.input[key]])
  return `${call.name}:${JSON.stringify(meaningful)}`
}

/**
 * One line per distinct call. A retried call is one line, not one per
 * attempt: its result once it succeeds, the attempt under way if one is, or
 * the failure with how many times it was tried.
 */
/** Calls grouped by what they asked for: a retry joins its first attempt. */
function groupCalls(calls: ToolCallView[]): ToolCallView[][] {
  const groups = new Map<string, ToolCallView[]>()
  for (const call of calls) {
    const key = callKey(call)
    groups.set(key, [...(groups.get(key) ?? []), call])
  }
  return Array.from(groups.values())
}

export function progressFor(calls: ToolCallView[]): ProgressLine[] {
  return groupCalls(calls).map((group) => {
    const done = [...group]
      .reverse()
      .find((call) => call.state === 'output-available')
    const running = group.find(
      (call) =>
        call.state !== 'output-available' && call.state !== 'output-error',
    )
    const line = progressLine(done ?? running ?? group[group.length - 1])
    if (!done && !running && group.length > 1) {
      line.text += ` · tried ${group.length === 2 ? 'twice' : `${group.length} times`}`
    }
    return { ...line, id: group[0].id }
  })
}

export function progressLines(message: UIMessage): ProgressLine[] {
  return progressFor(toolCalls(message))
}

export interface FoundTweets {
  /** Every tweet id in tool outputs, embedded quoted tweets included. */
  byId: Map<string, PortalTweet>
  /** Ids returned as results (not only as someone's quoted tweet), in order. */
  results: string[]
  /**
   * Relevance per id: the scorer's p. A command's `scores` (its files and
   * printed rows) replace earlier values; otherwise the highest p seen on a
   * tweet.
   */
  scores: Map<string, number>
  /** Workspace files the tools reported, path to ids (latest write wins). */
  files: Map<string, string[]>
  /**
   * Ids the tools returned as references (a reopened conversation) whose
   * tweet is not in hand, with why. A tool did return them, so a citation
   * of one is verified, just not showable yet.
   */
  missing: Map<string, TweetLoad>
}

/** A stored tweet reference (history.ts): its id, and its score if scored. */
const isRef = (value: LooseRecord): value is { $t: string; p?: unknown } =>
  typeof value.$t === 'string'

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
 * A reopened conversation's outputs hold references instead of tweets; each
 * resolves against `supply`, or is noted as missing with why.
 */
export function collectToolTweets(
  outputs: unknown[],
  supply?: TweetSupply,
): FoundTweets {
  const byId = new Map<string, PortalTweet>()
  const full = new Set<string>()
  const results: string[] = []
  const scores = new Map<string, number>()
  const missing = new Map<string, TweetLoad>()

  const visit = (value: unknown, embedded: boolean) => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, embedded))
      return
    }
    if (!isRecord(value)) return
    if (isRef(value)) {
      const id = value.$t
      const p = asNumber(value.p)
      const tweet = supply?.tweets.get(id)
      if (tweet) {
        visit(p === undefined ? tweet : { ...tweet, p }, embedded)
      } else {
        if (!missing.has(id)) {
          missing.set(id, supply?.states.get(id) ?? 'loading')
        }
        // The score is the reference's own; it sorts the tweet once it lands.
        if (p !== undefined) scores.set(id, Math.max(p, scores.get(id) ?? 0))
      }
      return
    }
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

  outputs.forEach((output) => {
    visit(output, false)
    if (isRecord(output) && isRecord(output.scores)) {
      for (const [id, p] of Object.entries(output.scores)) {
        if (typeof p === 'number' && Number.isFinite(p)) scores.set(id, p)
      }
    }
  })
  // A tweet that arrived through one output is in hand for all of them.
  for (const id of Array.from(missing.keys()))
    if (byId.has(id)) missing.delete(id)
  return {
    byId,
    results,
    scores,
    files: collectWorkspaceFiles(outputs),
    missing,
  }
}

export function citationAnchor(scope: string, tweetId: string) {
  return `ask-${scope}-tweet-${tweetId}`
}

export const UNVERIFIED_HREF_PREFIX = '#ask-unverified-'
/** A quote checked against its tweet links here, with the tweet's anchor. */
export const QUOTE_HREF_PREFIX = '#quote-'

/** A partial marker at the end of a streaming answer would flash as raw text. */
// While streaming, an unfinished marker would flash as raw syntax.
function trimPartialMarker(text: string) {
  return text
    .replace(/\[\[posts:[^\]]*\]?$/, '')
    .replace(/\[\[q(?::[^\]]*)?\]?$/, '')
    .replace(/\[(?:\[(?:t(?::\d*)?)?)?\]?$/, '')
}

/**
 * Numbers citations in order of first appearance and rewrites each marker as a
 * markdown link the renderer turns into a chip. Ids absent from every tool
 * output are unverified: the model named them, the tools never returned them.
 */
const EMBED_LINE = /^[ \t]*\[\[(?:t:)?(\d{1,20})\]\][ \t]*$/gm

// An @handle not preceded by a word character, a slash or another @.
const NAMED_HANDLE = /(^|[^\w/@])@(\w{1,15})(?!\w)/g
// Where a chip's own clause starts: after a line break, a sentence end, or
// the previous citation (a raw marker or a rewritten chip link).
const CLAUSE_BREAK = /\n|[.!?](?=\s)|\]\]|\]\([^)]*\)/g

/**
 * The one person a citation's clause names before its chip, or null when it
 * names none or several (too ambiguous to judge).
 */
export function namedBeforeChip(before: string): string | null {
  let start = 0
  for (const match of Array.from(before.matchAll(CLAUSE_BREAK))) {
    start = (match.index ?? 0) + match[0].length
  }
  const handles = new Map<string, string>()
  for (const match of Array.from(before.slice(start).matchAll(NAMED_HANDLE))) {
    handles.set(match[2].toLowerCase(), match[2])
  }
  return handles.size === 1 ? Array.from(handles.values())[0] : null
}

/**
 * Whether a clause naming `named` and citing `tweet` cites someone else: the
 * author differs and the tweet neither mentions nor quotes the named person
 * (a reply to them, or a quote of their tweet, is about them).
 */
export function citesSomeoneElse(named: string, tweet: PortalTweet) {
  const person = named.toLowerCase()
  if (tweet.username.toLowerCase() === person) return false
  if (tweet.quotedTweet?.username.toLowerCase() === person) return false
  const mentioned = new Set(
    Array.from(tweet.text.matchAll(NAMED_HANDLE), (m) => m[2].toLowerCase()),
  )
  return !mentioned.has(person)
}

export function buildAnswer(
  text: string,
  found: FoundTweets,
  scope: string,
  options: { streaming?: boolean } = {},
): AnswerView {
  const source = options.streaming ? trimPartialMarker(text) : text
  const citations: Citation[] = []
  const unverified: string[] = []
  const listed: string[] = []
  const missingLists: string[] = []
  const loading: string[] = []
  const failed: string[] = []
  const unavailable: string[] = []
  const authorMismatches: AuthorMismatch[] = []
  // A chip whose clause names someone other than the cited tweet's author
  // carries a warning as its link title; the renderer marks it.
  const chipFor = (citation: Citation, before: string) => {
    const named = citation.tweet ? namedBeforeChip(before) : null
    if (!named || !citation.tweet || !citesSomeoneElse(named, citation.tweet)) {
      return `[${citation.n}](#${citation.anchor})`
    }
    const author = citation.tweet.username
    if (!authorMismatches.some((item) => item.id === citation.id)) {
      authorMismatches.push({ id: citation.id, n: citation.n, named, author })
    }
    return `[${citation.n}](#${citation.anchor} "${AUTHOR_MISMATCH_TITLE(author, named)}")`
  }
  const noteMissing = (id: string, state: TweetLoad) => {
    const list =
      state === 'loading' ? loading : state === 'failed' ? failed : unavailable
    if (!list.includes(id)) list.push(id)
  }
  // The citation for a tweet a tool returned, numbered on first use. A tweet
  // not in hand yet (a reopened conversation) keeps its number, so nothing
  // renumbers when it lands; an id no tool returned is noted as unverified.
  const citationFor = (id: string) => {
    const tweet = found.byId.get(id) ?? null
    const missing = found.missing.get(id)
    if (!tweet && !missing) {
      if (!unverified.includes(id)) unverified.push(id)
      return null
    }
    let citation = citations.find((item) => item.id === id)
    if (!citation) {
      if (missing) noteMissing(id, missing)
      const base = {
        id,
        n: citations.length + 1,
        anchor: citationAnchor(scope, id),
      }
      citation = tweet
        ? { ...base, tweet, state: 'loaded' }
        : { ...base, tweet: null, state: missing as TweetLoad }
      citations.push(citation)
    }
    return citation
  }
  // A quote the tweet has word for word is shown as a quote; one it does not
  // have is shown as the agent's words, without quote marks. Either way the
  // tweet is cited. Until the tweet is in hand the words cannot be checked.
  const quote = (prose: string) =>
    prose.replace(
      new RegExp(QUOTE_PATTERN.source, 'g'),
      (_marker, id: string, words: string, offset: number) => {
        const citation = citationFor(id)
        const safe = words.replace(/[[\]\\]/g, '')
        if (!citation) {
          return `${safe} [unverified](${UNVERIFIED_HREF_PREFIX}${id})`
        }
        const chip = chipFor(citation, prose.slice(0, offset))
        return citation.tweet && isVerbatim(words, citation.tweet.text)
          ? `[${safe}](${QUOTE_HREF_PREFIX}${citation.anchor}) ${chip}`
          : `${safe} ${chip}`
      },
    )
  const cite = (value: string) => {
    const prose = quote(value)
    return prose.replace(
      new RegExp(CITATION_PATTERN.source, 'g'),
      (_marker, id: string, offset: number) => {
        // Chips need a gap from the word or chip before them, but no double space.
        const gap = offset > 0 && !/\s/.test(prose[offset - 1]) ? ' ' : ''
        const citation = citationFor(id)
        if (!citation)
          return `${gap}[unverified](${UNVERIFIED_HREF_PREFIX}${id})`
        return `${gap}${chipFor(citation, prose.slice(0, offset))}`
      },
    )
  }

  const blocks: AnswerBlock[] = []
  splitPostLists(source).forEach((part, index) => {
    if (part.type === 'text') {
      const prose = (value: string) => {
        if (value.trim()) blocks.push({ kind: 'text', markdown: cite(value) })
      }
      // A citation alone on its line shows the whole tweet there.
      let last = 0
      for (const match of Array.from(part.value.matchAll(EMBED_LINE))) {
        const start = match.index ?? 0
        prose(part.value.slice(last, start))
        last = start + match[0].length
        const citation = citationFor(match[1])
        if (citation) {
          blocks.push({
            kind: 'tweet',
            key: `${scope}-tweet-${index}-${start}`,
            citation,
          })
        }
      }
      prose(part.value.slice(last))
      return
    }
    // A list naming a workspace file no tool reported is not shown, and
    // named. Ids no tool returned are dropped from the list and named as
    // unverified, as citations are; a list left empty is not shown. Listed
    // tweets not in hand yet hold a place in the list until they land; one
    // the gateway no longer has is left out, as before.
    const ids = part.path ? found.files.get(part.path) : part.ids
    if (!ids) {
      if (part.path && !missingLists.includes(part.path)) {
        missingLists.push(part.path)
      }
      return
    }
    const tweets: PortalTweet[] = []
    const pending: Array<{ id: string; state: TweetLoad }> = []
    for (const id of ids) {
      const tweet = found.byId.get(id)
      if (!tweet) {
        const missing = found.missing.get(id)
        if (!missing) {
          if (!unverified.includes(id)) unverified.push(id)
          continue
        }
        noteMissing(id, missing)
        if (missing !== 'unavailable') {
          pending.push({ id, state: missing })
          if (!listed.includes(id)) listed.push(id)
        }
        continue
      }
      tweets.push(tweet)
      if (!listed.includes(id)) listed.push(id)
    }
    if (tweets.length || pending.length) {
      const scores = new Map<string, number>()
      for (const tweet of tweets) {
        const score = found.scores.get(tweet.id)
        if (score !== undefined) scores.set(tweet.id, score)
      }
      blocks.push({
        kind: 'list',
        key: `${scope}-list-${index}`,
        label: part.label,
        tweets,
        view: part.view,
        scores,
        pending,
      })
    }
  })
  // Opt-out takes precedence over a stored answer (AGENTS.md): when a tweet
  // the prose cites is no longer available, the prose still names and
  // describes its author, so it is not shown. The answer's lists keep what
  // is still available; their gone tweets already dropped out above. A live
  // answer's tweets arrive with it, so this only touches reopened ones.
  const withheld =
    !options.streaming &&
    citations.some((citation) => citation.state === 'unavailable')
  // Until every tweet the prose cites has loaded, a reopened answer's prose
  // is held back too: it may name someone who has since opted out, and
  // showing it first and withdrawing it later would still serve it.
  const checking =
    !withheld &&
    !options.streaming &&
    citations.some(
      (citation) => citation.state === 'loading' || citation.state === 'failed',
    )
  const shown = withheld
    ? blocks.filter((block) => block.kind === 'list')
    : blocks
  const markdown = shown
    .flatMap((block) => (block.kind === 'text' ? [block.markdown] : []))
    .join('\n\n')
  return {
    markdown,
    blocks: shown,
    citations: withheld ? [] : citations,
    listed,
    unverified: withheld ? [] : unverified,
    missingLists,
    loading,
    failed,
    unavailable,
    authorMismatches: withheld ? [] : authorMismatches,
    withheld,
    checking,
  }
}

/** The warning a chip carries when its clause names someone else. */
export const AUTHOR_MISMATCH_TITLE = (author: string, named: string) =>
  `This tweet is by @${author}, not @${named}`

/**
 * What was searched, for people: one line per distinct search (paging of the
 * same search is summed into one line), the scoring totals, and what else
 * was read.
 */
export function buildCoverage(calls: ToolCallView[]): CoverageView {
  const coverage: CoverageView = {
    searches: [],
    scored: 0,
    kept: 0,
    capped: false,
    threadsRead: 0,
    quotesRead: 0,
    people: [],
  }
  interface Tally {
    label: string
    scoring: boolean
    runs: number
    tweets: number
    checked: number
    kept: number
    capped: boolean
  }
  // Keyed by kind and label: a keyword search and a scoring check over the
  // same words are different lines.
  const searches = new Map<string, Tally>()
  const tally = (label: string, scoring: boolean) => {
    const key = `${scoring ? 'check' : 'search'}:${label}`
    let entry = searches.get(key)
    if (!entry) {
      entry = {
        label,
        scoring,
        runs: 0,
        tweets: 0,
        checked: 0,
        kept: 0,
        capped: false,
      }
      searches.set(key, entry)
    }
    entry.runs += 1
    return entry
  }
  for (const call of calls) {
    if (call.state !== 'output-available') continue
    const out = isRecord(call.output) ? call.output : {}
    switch (call.name) {
      case 'find_people': {
        const query = asString(call.input.query)
        if (query && !coverage.people.includes(query))
          coverage.people.push(query)
        break
      }
      case 'search_tweets': {
        // Further pages of one search read as that search.
        const input = { ...call.input }
        delete input.offset
        tally(searchSubject(input) ?? 'recent tweets', false).tweets += asArray(
          out.tweets,
        ).length
        break
      }
      case 'semantic_search': {
        tally(`${meaningSubject(call.input)}, by meaning`, false).tweets +=
          asArray(out.tweets).length
        break
      }
      case 'collect_and_score': {
        const scored = asNumber(out.scored) ?? 0
        const kept = collectKept(out)
        const entry = tally(termsSubject(call.input), true)
        entry.checked += asNumber(out.collected) ?? 0
        entry.kept += kept
        if (out.capped) {
          entry.capped = true
          coverage.capped = true
        }
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
  coverage.searches = Array.from(searches.values()).map((entry) => {
    const times = entry.runs > 1 ? ` from ${entry.runs} searches` : ''
    return {
      label: entry.label,
      detail: entry.scoring
        ? `${plural(entry.checked, 'tweet')} checked, ${entry.kept.toLocaleString('en-US')} relevant${
            entry.capped ? ', stopped at the limit' : ''
          }`
        : `${plural(entry.tweets, 'tweet')}${times}`,
    }
  })
  return coverage
}

export function messageText(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
}

/**
 * The answer is the text after the last tool call; earlier text is the
 * model thinking aloud between searches ("I'll look for…"), never the
 * answer. A turn that called no tools (a clarifying question) is all text.
 */
export function answerText(message: UIMessage): string {
  const parts = message.parts
  let lastTool = -1
  parts.forEach((part, index) => {
    if (part.type === 'dynamic-tool' || part.type.startsWith('tool-'))
      lastTool = index
  })
  return parts
    .slice(lastTool + 1)
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
}

export interface TurnViewOptions {
  streaming?: boolean
  /**
   * A reopened conversation: the tweets fetched so far for its stored
   * references. Building the view again with more of them fills the answer
   * in place; numbering never changes, since every reference counts.
   */
  supply?: TweetSupply
}

/**
 * Builds the view for the assistant message at `index`. Citations resolve
 * against tool outputs from this and earlier turns, since a follow-up answer
 * may cite tweets the agent found for an earlier question.
 */
export function buildTurnView(
  messages: UIMessage[],
  index: number,
  options: TurnViewOptions = {},
): TurnView {
  const message = messages[index]
  const calls = toolCalls(message)
  const priorOutputs = messages
    .slice(0, index)
    .filter((item) => item.role === 'assistant')
    .flatMap((item) => toolCalls(item).map((call) => call.output))
  const ownOutputs = calls.map((call) => call.output)
  const found = collectToolTweets(
    [...ownOutputs, ...priorOutputs],
    options.supply,
  )
  // Files in time order, so this turn's latest write of a path wins.
  found.files = collectWorkspaceFiles([...priorOutputs, ...ownOutputs])
  const own = collectToolTweets(ownOutputs, options.supply)
  const tweets = { loading: 0, failed: 0, unavailable: 0 }
  own.missing.forEach((state) => {
    tweets[state] += 1
  })
  const text = answerText(message)
  let outcome = turnOutcome(text)
  // A finished turn with no answer did not finish properly, however the
  // stream ended.
  if (outcome === 'done' && !options.streaming && !text.trim()) {
    outcome = 'failed'
  }
  const answer = buildAnswer(
    outcome === 'done' ? text : '',
    found,
    message.id,
    options,
  )
  // Sources below the answer hold what the answer neither cites nor lists.
  const cited = new Set([
    ...answer.citations.map((citation) => citation.id),
    ...answer.listed,
  ])
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
    if (call.name === 'search_tweets' || call.name === 'semantic_search') {
      searches += 1
    }
    if (call.name === 'collect_and_score') {
      searches += 1
      relevantNotShown += Math.max(
        0,
        collectKept(out) - asArray(out.kept).length,
      )
      if (out.capped) {
        cappedAt =
          asNumber(out.limit) ??
          asNumber(call.input.maxTweets) ??
          DEFAULT_COLLECT
      }
    }
  }

  return {
    outcome,
    unavailable:
      outcome === 'failed' &&
      calls.length > 0 &&
      calls.every((call) => call.state === 'output-error'),
    progress: progressFor(calls),
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
    ...foundSoFar(calls, own),
    timeline: timelineFor(message),
    tweets,
  }
}

/** Tweets the side column shows while the answer is written. */
const TOP_FOUND = 5

/**
 * The side column's tweets while a turn runs. Before the relevance check has
 * scored anything, search order says little about quality, so the column
 * shows the latest command's matches and names the command; once scores
 * exist it shows the highest scored.
 */
function foundSoFar(
  calls: ToolCallView[],
  own: FoundTweets,
): { topFound: FoundTweet[]; foundPhase: FoundPhase } {
  const item = (id: string): FoundTweet => ({
    tweet: own.byId.get(id) as PortalTweet,
    score: own.scores.get(id),
  })
  const scored = own.results.filter((id) => own.scores.has(id))
  if (scored.length) {
    let relevant = 0
    own.scores.forEach((p) => {
      if (p >= KEPT_P) relevant += 1
    })
    return {
      topFound: orderByScore(own.results, own.scores)
        .slice(0, TOP_FOUND)
        .map(item),
      foundPhase: { kind: 'relevant', relevant },
    }
  }
  // The newest call that returned tweets, in its own order; earlier
  // results fill the column if it returned fewer.
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i]
    if (call.state !== 'output-available') continue
    const latest = collectToolTweets([call.output]).results.filter((id) =>
      own.byId.has(id),
    )
    if (!latest.length) continue
    const rest = own.results.filter((id) => !latest.includes(id))
    const text = progressFor([call])[0]?.text ?? ''
    return {
      topFound: [...latest, ...rest].slice(0, TOP_FOUND).map(item),
      foundPhase: { kind: 'latest', source: text.split(' · ')[0] || null },
    }
  }
  return { topFound: [], foundPhase: { kind: 'latest', source: null } }
}

/**
 * The folded step log in one line: how much searching happened and what the
 * answer rests on. "6 steps · 4 tweets cited · 27 more found".
 */
export function logSummary(
  view: TurnView,
  options: {
    writing?: boolean
    /** Leave out "N more found"; the page shows it as its own control. */
    withoutMore?: boolean
  } = {},
): string {
  const steps = view.progress.length
  if (!steps) return 'No new searches, used the earlier tweets'
  const parts = [plural(steps, 'step')]
  if (options.writing) return [...parts, 'writing the answer'].join(' · ')
  const shown = new Set([
    ...view.answer.citations.map((citation) => citation.id),
    ...view.answer.listed,
  ]).size
  if (view.answer.listed.length)
    parts.push(`${plural(shown, 'tweet')} in the answer`)
  else if (shown) parts.push(`${plural(shown, 'tweet')} cited`)
  const more = view.receipt.relevant + view.receipt.other
  if (more && !options.withoutMore) {
    parts.push(`${more.toLocaleString('en-US')} more found`)
  }
  if (!shown && !more && !view.foundSoFar) parts.push('nothing found')
  return parts.join(' · ')
}

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
  daily_limit: "You've used today's questions. You can ask again tomorrow.",
  monthly_limit:
    "You've used this month's questions. You can ask again next month.",
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
  quota?: {
    /** Today's count: its limit and when it starts over. */
    limit: number
    resetLabel: string
    /** This month's, when the page knows it. */
    month?: { limit: number; resetLabel: string }
  },
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
  if (code === 'monthly_limit' && quota?.month) {
    return `You’ve used this month’s ${quota.month.limit} questions. You can ask again on ${quota.month.resetLabel}.`
  }
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (status === 401) return 'Sign in to ask a question.'
  if (status === 403) return ERROR_MESSAGES.not_eligible
  if (status === 429) return 'You have reached a usage limit. Try again later.'
  if (status === 400)
    return 'That question could not be sent. Check it and try again.'
  return 'The archive search is not responding right now. Try again in a few minutes.'
}
