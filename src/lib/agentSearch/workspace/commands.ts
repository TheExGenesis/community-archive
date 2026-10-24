import { decodeBytesToUtf8, defineCommand } from 'just-bash'
import { ScoringError } from '../classifier'
import type { RunLimits } from '../deadline'
import {
  ApiV1Error,
  getAccountTweets,
  getTweetDetails,
  getTweetsByIdsBatched,
  type SearchMode,
  type SearchSort,
} from '../gateway'
import { inPhase } from '../trace'
import {
  BORDERLINE_THRESHOLD,
  KEEP_THRESHOLD,
  MAX_COLLECT,
  collectAcrossTerms,
  findPeopleImpl,
  getQuotePostsImpl,
  getThreadImpl,
  scoreWithParents,
  searchPages,
} from '../toolImpl'
import {
  MAX_SEMANTIC_CALLS_PER_RUN,
  SEMANTIC_DEFAULT_K,
  SEMANTIC_DEFAULT_THRESHOLD,
  SEMANTIC_LIMIT_MESSAGE,
  semanticSearch,
} from '../semantic'
import type { AgentTweet } from '../types'
import { formatRows, parseRowFile, toRow, uniqueIds } from './rows'

// The archive commands the agent runs in its workspace. They are our code
// (trusted just-bash commands), wrapping the same gateway and scorer calls as
// the typed tools, so the gateway's opt-out filtering, the run's deadline and
// spend recording all still apply. Each prints JSON Lines tweet rows on
// stdout, so its output can be redirected to a file and piped through jq,
// and a one-line summary on stderr, which the model sees even when stdout
// goes to a file.

/** What the commands of one shell execution share. */
export interface CommandState {
  limits: RunLimits
  /** Every tweet fetched in this execution, by id. */
  cache: Map<string, AgentTweet>
  /** Scorer spend in this execution. */
  costUsd: number
  /** One line per archive command, for the page. */
  summaries: string[]
  /** Archive calls that ran, and those that failed (gateway or scorer). */
  calls: number
  failures: number
  /** Semantic searches this question may still run, and those run here. */
  semanticRemaining: number
  semanticCalls: number
}

export function createCommandState(
  limits: RunLimits,
  semanticUsed = 0,
): CommandState {
  return {
    limits,
    cache: new Map(),
    costUsd: 0,
    summaries: [],
    calls: 0,
    failures: 0,
    semanticRemaining: Math.max(0, MAX_SEMANTIC_CALLS_PER_RUN - semanticUsed),
    semanticCalls: 0,
  }
}

const SEARCH_DEFAULT = 50
const MAX_IDS_PER_COMMAND = MAX_COLLECT
/** timeline: tweets per API page, the default, and the most one command reads. */
const TIMELINE_PAGE = 200
const TIMELINE_DEFAULT = 200
const MAX_TIMELINE = 3000
/** Pages timeline may read beyond those the limit needs, for short pages. */
const TIMELINE_SPARE_PAGES = 10
/** par: the most command lines it takes, and how many run at once. */
const MAX_PAR = 30
const PAR_CONCURRENCY = 6
/** expand: a seed's lowest p, the seeds it takes, and the tweets it prints. */
const EXPAND_MIN_P = 0.7
const EXPAND_SEEDS = 15
const MAX_EXPAND_SEEDS = 40
const EXPAND_DEFAULT = 300
/** Seeds expanded at once, each with two gateway calls in flight. */
const EXPAND_CONCURRENCY = 4

/** Fetches tweets by id through the gateway, using what this run has seen. */
export async function fetchTweets(
  state: CommandState,
  ids: string[],
): Promise<AgentTweet[]> {
  const missing = ids.filter((id) => !state.cache.has(id))
  if (missing.length) {
    const found = await getTweetsByIdsBatched(missing, state.limits)
    for (const tweet of found) state.cache.set(tweet.id, tweet)
  }
  return ids
    .map((id) => state.cache.get(id))
    .filter((tweet): tweet is AgentTweet => Boolean(tweet))
}

function remember(state: CommandState, tweets: AgentTweet[]) {
  for (const tweet of tweets) state.cache.set(tweet.id, tweet)
}

/** Runs `run` on every item, `concurrency` at a time, results in item order. */
async function inPool<T, R>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await run(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  )
  return results
}

const quote = (value: string) => `“${value}”`
const plural = (n: number, word: string) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? word : `${word}s`}`

/** `--flag value`, `--flag=value` and boolean `--flag`, plus positionals. */
export function parseCommandArgs(
  args: string[],
  valueFlags: string[],
  booleanFlags: string[] = [],
): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--') || arg === '--') {
      positional.push(arg)
      continue
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2)
    if (booleanFlags.includes(name)) flags[name] = true
    else if (valueFlags.includes(name)) {
      const value = inline ?? args[++i]
      if (value === undefined) throw new UsageError(`--${name} needs a value`)
      flags[name] = value
    } else throw new UsageError(`unknown option --${name}`)
  }
  return { positional, flags }
}

class UsageError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TWEET_ID = /^\d{1,20}$/

function dateFlag(value: string | true | undefined, name: string) {
  if (value === undefined) return undefined
  if (value === true || !DATE.test(value)) {
    throw new UsageError(`--${name} must be YYYY-MM-DD`)
  }
  return value
}

function intFlag(
  value: string | true | undefined,
  name: string,
  fallback: number,
  max: number,
) {
  if (value === undefined) return fallback
  const n = Number(value)
  if (value === true || !Number.isInteger(n) || n < 1) {
    throw new UsageError(`--${name} must be a positive whole number`)
  }
  return Math.min(n, max)
}

const handleFlag = (value: string | true | undefined) =>
  typeof value === 'string' && value.trim()
    ? value.trim().replace(/^@/, '')
    : undefined

function span(tweets: AgentTweet[]) {
  const dates = tweets.map((tweet) => tweet.createdAt.slice(0, 10)).sort()
  if (!dates.length) return ''
  return dates[0] === dates[dates.length - 1]
    ? dates[0]
    : `${dates[0]} to ${dates[dates.length - 1]}`
}

/** `200 tweets · 31 authors · 2019-03-02 to 2026-09-30`. */
function describe(tweets: AgentTweet[], noun = 'tweet') {
  const authors = new Set(tweets.map((tweet) => tweet.username)).size
  return [
    plural(tweets.length, noun),
    tweets.length ? plural(authors, 'author') : null,
    span(tweets) || null,
  ]
    .filter(Boolean)
    .join(' · ')
}

type CommandResult = { stdout: string; stderr: string; exitCode: number }
type Handler = (
  args: string[],
  ctx: {
    stdin: Uint8Array | string
    readFile: (path: string) => Promise<string>
  },
) => Promise<CommandResult>

/** Runs an archive command, turning failures into a shell error. */
function archiveCommand(state: CommandState, name: string, run: Handler) {
  return defineCommand(name, async (args, ctx) => {
    const callsBefore = state.calls
    try {
      return await inPhase(state.limits, name, () =>
        run(args, {
          stdin: ctx.stdin as unknown as Uint8Array,
          readFile: (path) =>
            ctx.fs.readFile(
              path.startsWith('/')
                ? path
                : `${ctx.cwd.replace(/\/$/, '')}/${path}`,
            ),
        }),
      )
    } catch (error) {
      if (error instanceof UsageError) {
        return {
          stdout: '',
          stderr: `${name}: ${error.message}\n${USAGE[name] ?? ''}\n`,
          exitCode: 2,
        }
      }
      // Only failed gateway calls say the archive is down; a failed semantic
      // search (a separate service) does not.
      if (state.calls > callsBefore) state.failures += 1
      const message = error instanceof Error ? error.message : String(error)
      return { stdout: '', stderr: `${name}: ${message}\n`, exitCode: 1 }
    }
  })
}

export const USAGE: Record<string, string> = {
  search:
    'usage: search <words> [--any w1,w2] [--phrase] [--from @handle] [--reply-to @handle] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--sort newest|oldest|likes|reposts] [--limit N]',
  semantic:
    'usage: semantic "<what the tweets say, in plain words>" [--from @handle] [--k N] [--threshold 0-1]',
  people: 'usage: people <name or handle>',
  timeline:
    'usage: timeline @handle [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--oldest] [--no-replies] [--retweets] [--limit N]',
  par: "usage: par '<command with {}>' word... | par '<command>' '<command>'...",
  score:
    'usage: score <file> "<yes/no question about one tweet>" [--no-parent]',
  thread: 'usage: thread <tweet id>',
  quotes: 'usage: quotes <tweet id> [--limit N]',
  expand: 'usage: expand <scored file> [--min-p P] [--seeds N] [--limit N]',
  tweets: 'usage: tweets <tweet id>... (or ids on stdin)',
  show: 'usage: show <tweet id>',
}

const SEARCH_SORTS: readonly SearchSort[] = [
  'newest',
  'oldest',
  'likes',
  'reposts',
]

/**
 * What a search looked for, saying how several words matched:
 * `all of “a b”`, `“a b” as a phrase`, or for --any terms
 * `“a” or “b c” (all words of each)`.
 */
function searchedFor(terms: string[], mode: SearchMode) {
  const quoted = terms.map(quote).join(' or ')
  if (mode === 'all' && !terms.some((term) => /\s/.test(term))) return quoted
  if (terms.length === 1) {
    return mode === 'phrase' ? `${quoted} as a phrase` : `all of ${quoted}`
  }
  return mode === 'phrase'
    ? `${quoted} (each as a phrase)`
    : `${quoted} (all words of each)`
}

async function search(
  state: CommandState,
  args: string[],
): Promise<CommandResult> {
  const { positional, flags } = parseCommandArgs(
    args,
    ['any', 'from', 'reply-to', 'since', 'until', 'sort', 'limit'],
    ['phrase', 'all'],
  )
  const query = positional.join(' ').trim()
  if (!query) throw new UsageError('give the words to search for')
  const sort = flags.sort as SearchSort | undefined
  if (sort !== undefined && !SEARCH_SORTS.includes(sort)) {
    throw new UsageError('--sort must be newest, oldest, likes or reposts')
  }
  // Several words match every word, in any order, unless --phrase asks for
  // the exact phrase. --all asked for every word when the phrase was the
  // default; it is accepted, and changes nothing, so older prompts and
  // stored runs still parse. The typed search_tweets tool keeps the
  // gateway's own default.
  const mode: SearchMode = flags.phrase ? 'phrase' : 'all'
  const limit = intFlag(flags.limit, 'limit', SEARCH_DEFAULT, MAX_COLLECT)
  const fromUser = handleFlag(flags.from)
  const replyToUser = handleFlag(flags['reply-to'])
  const since = dateFlag(flags.since, 'since')
  const until = dateFlag(flags.until, 'until')
  const alternatives =
    typeof flags.any === 'string'
      ? flags.any
          .split(',')
          .map((term) => term.trim())
          .filter(Boolean)
      : []
  const filters = { mode, fromUser, replyToUser, since, until, sort }

  state.calls += 1
  let tweets: AgentTweet[] = []
  let more = false
  const terms = alternatives.length
    ? Array.from(new Set([query, ...alternatives])).slice(0, 9)
    : [query]
  if (alternatives.length) {
    // Every term is searched in the same mode, with the same filters and
    // sort. With --sort likes the merged rows interleave each term's sorted
    // list, so they are not in like order overall.
    const { collected, capped } = await collectAcrossTerms(
      terms,
      limit,
      filters,
      state.limits,
    )
    tweets = Array.from(collected.values())
    more = capped
  } else {
    const result = await searchPages({ ...filters, query }, limit, state.limits)
    tweets = result.tweets
    more = result.nextOffset !== null
  }
  remember(state, tweets)
  // The page's line names the words; the model's also says how they matched.
  const who = [
    fromUser ? `from @${fromUser}` : null,
    replyToUser ? `replying to @${replyToUser}` : null,
  ]
  const words = (head: string) => [head, ...who].filter(Boolean).join(' ')
  state.summaries.push(
    `Searched ${words([query, ...alternatives].map(quote).join(' or '))} · ${plural(tweets.length, 'tweet')}`,
  )
  return {
    stdout: formatRows(tweets.map((tweet) => toRow(tweet))),
    stderr: `search ${words(searchedFor(terms, mode))}: ${describe(tweets)}${more ? ` · more exist (raise --limit, max ${MAX_COLLECT})` : ''}\n`,
    exitCode: 0,
  }
}

async function semantic(
  state: CommandState,
  args: string[],
): Promise<CommandResult> {
  const { positional, flags } = parseCommandArgs(args, [
    'from',
    'k',
    'threshold',
  ])
  const query = positional.join(' ').trim()
  if (!query) throw new UsageError('describe what the tweets say')
  const threshold =
    flags.threshold === undefined
      ? SEMANTIC_DEFAULT_THRESHOLD
      : Number(flags.threshold)
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new UsageError('--threshold must be between 0 and 1')
  }
  if (state.semanticRemaining <= 0) {
    return {
      stdout: '',
      stderr: `semantic: ${SEMANTIC_LIMIT_MESSAGE}\n`,
      exitCode: 1,
    }
  }
  state.semanticRemaining -= 1
  state.semanticCalls += 1
  const fromUser = handleFlag(flags.from)
  const result = await semanticSearch(
    {
      query,
      fromUser,
      k: intFlag(flags.k, 'k', SEMANTIC_DEFAULT_K, MAX_COLLECT),
      threshold,
    },
    state.limits,
  )
  remember(state, result.tweets)
  const what = `${quote(query)}${fromUser ? ` from @${fromUser}` : ''}`
  state.summaries.push(
    `Searched by meaning for ${what} · ${plural(result.tweets.length, 'tweet')}`,
  )
  return {
    stdout: formatRows(
      result.tweets.map((tweet) => ({
        ...toRow(tweet),
        distance: tweet.distance,
      })),
    ),
    stderr:
      `semantic ${what}: ${describe(result.tweets)} · rows ordered by distance, closest first` +
      ` · ${state.semanticRemaining} semantic ${state.semanticRemaining === 1 ? 'search' : 'searches'} left\n`,
    exitCode: 0,
  }
}

const HANDLE_ARG = /^@?[A-Za-z0-9_]{1,50}$/

/** One person's own tweets, newest first, through the API's timeline. */
async function timeline(
  state: CommandState,
  args: string[],
): Promise<CommandResult> {
  const { positional, flags } = parseCommandArgs(
    args,
    ['since', 'until', 'limit'],
    ['oldest', 'no-replies', 'retweets'],
  )
  const handle = positional.join('').trim()
  if (!HANDLE_ARG.test(handle)) throw new UsageError('give one @handle')
  const limit = intFlag(flags.limit, 'limit', TIMELINE_DEFAULT, MAX_TIMELINE)
  const since = dateFlag(flags.since, 'since')
  const until = dateFlag(flags.until, 'until')
  const name = `@${handle.replace(/^@/, '')}`

  state.calls += 1
  const tweets: AgentTweet[] = []
  // A short or empty page is not the end (the API leaves out deleted
  // tweets); a null cursor is. A cursor already followed, or more pages than
  // the limit could need, stops an API that would otherwise page forever.
  const maxPages = Math.ceil(limit / TIMELINE_PAGE) + TIMELINE_SPARE_PAGES
  const followed = new Set<string>()
  let cursor: string | null = null
  let cutShort: string | null = null
  try {
    for (let pages = 1; ; pages++) {
      const page = await getAccountTweets(
        {
          account: name,
          order: flags.oldest ? 'asc' : 'desc',
          since,
          // --until is inclusive, like search; the API's is exclusive.
          until: until && nextDay(until),
          excludeReplies: Boolean(flags['no-replies']),
          excludeRetweets: !flags.retweets,
          limit: Math.min(TIMELINE_PAGE, limit - tweets.length),
          ...(cursor ? { cursor } : {}),
        },
        state.limits,
      )
      tweets.push(...page.tweets)
      cursor = page.nextCursor
      if (!cursor || tweets.length >= limit) break
      if (followed.has(cursor)) {
        cutShort = 'stopped: the API sent the same page cursor twice'
        break
      }
      if (pages >= maxPages) {
        cutShort = `stopped after ${maxPages} pages`
        break
      }
      followed.add(cursor)
    }
  } catch (error) {
    if (error instanceof ApiV1Error && error.status === 404) {
      state.summaries.push(`No member ${name}`)
      return {
        stdout: '',
        stderr: `timeline ${name}: no such member in the archive (try people)\n`,
        exitCode: 1,
      }
    }
    if (error instanceof ApiV1Error && error.status === 422) {
      // The pages read before the refusal are still printed, marked partial.
      remember(state, tweets)
      state.summaries.push(
        `Read ${name}'s tweets · ${tweets.length ? `${plural(tweets.length, 'tweet')}, partial` : 'too broad'}`,
      )
      return {
        stdout: formatRows(tweets.map((tweet) => toRow(tweet))),
        stderr:
          `timeline ${name}: too broad for the API's query budget; narrow it with --since/--until` +
          (tweets.length ? ` · partial results: ${describe(tweets)}` : '') +
          '\n',
        exitCode: 1,
      }
    }
    throw error
  }
  remember(state, tweets)
  state.summaries.push(
    `Read ${name}'s tweets · ${plural(tweets.length, 'tweet')}`,
  )
  return {
    stdout: formatRows(tweets.map((tweet) => toRow(tweet))),
    stderr:
      `timeline ${name}: ${describe(tweets)}` +
      (cutShort
        ? ` · ${cutShort}; more may exist (narrow it with --since/--until)`
        : cursor
          ? ` · more exist (raise --limit, max ${MAX_TIMELINE}, or use --since/--until)`
          : '') +
      '\n',
    exitCode: 0,
  }
}

function nextDay(date: string) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

async function people(
  state: CommandState,
  args: string[],
): Promise<CommandResult> {
  const query = args.join(' ').trim()
  if (!query) throw new UsageError('give a name or handle')
  state.calls += 1
  const result = await findPeopleImpl({ query }, state.limits)
  const lines = (result.members ?? []).map((member) =>
    JSON.stringify({ handle: `@${member.username}`, name: member.displayName }),
  )
  if (
    result.user &&
    !result.members?.some((m) => m.username === result.user?.username)
  ) {
    lines.unshift(
      JSON.stringify({
        handle: `@${result.user.username}`,
        name: result.user.displayName,
        tweets: result.user.tweets,
      }),
    )
  }
  state.summaries.push(
    `Looked up ${quote(query)} · ${plural(lines.length, 'member')}`,
  )
  return {
    stdout: lines.length ? `${lines.join('\n')}\n` : '',
    stderr: `people ${quote(query)}: ${plural(lines.length, 'member')}\n`,
    exitCode: 0,
  }
}

async function readRows(
  path: string,
  readFile: (path: string) => Promise<string>,
) {
  const content = await readFile(path).catch(() => {
    throw new UsageError(`no such file: ${path}`)
  })
  const rows = parseRowFile(content)
  if (!rows) throw new UsageError(`${path} is not a tweet file`)
  return rows
}

async function readIds(
  path: string,
  readFile: (path: string) => Promise<string>,
): Promise<string[]> {
  return uniqueIds(await readRows(path, readFile))
}

async function score(
  state: CommandState,
  args: string[],
  readFile: (path: string) => Promise<string>,
): Promise<CommandResult> {
  const { positional, flags } = parseCommandArgs(args, [], ['no-parent'])
  const [path, ...rest] = positional
  const criterion = rest.join(' ').trim()
  if (!path || criterion.length < 10) {
    throw new UsageError(
      'give a file and a yes/no question of at least 10 characters',
    )
  }
  const ids = await readIds(path, readFile)
  if (ids.length > MAX_IDS_PER_COMMAND) {
    throw new UsageError(
      `${path} has ${ids.length} tweets; score at most ${MAX_IDS_PER_COMMAND} (use head)`,
    )
  }
  state.calls += 1
  const tweets = await fetchTweets(state, ids)
  let result: Awaited<ReturnType<typeof scoreWithParents>>
  try {
    result = await scoreWithParents(
      criterion,
      tweets,
      !flags['no-parent'],
      state.limits,
    )
  } catch (error) {
    // A partly failed scoring run still spent money.
    if (error instanceof ScoringError) state.costUsd += error.costUsd
    throw error
  }
  state.costUsd += result.costUsd
  const kept = result.scored.filter((tweet) => tweet.p >= KEEP_THRESHOLD).length
  const borderline = result.scored.filter(
    (tweet) => tweet.p >= BORDERLINE_THRESHOLD && tweet.p < KEEP_THRESHOLD,
  ).length
  state.summaries.push(
    `Checked ${plural(result.scored.length, 'tweet')} · ${kept.toLocaleString('en-US')} relevant`,
  )
  return {
    stdout: formatRows(result.scored.map((tweet) => toRow(tweet, tweet.p))),
    stderr:
      `score ${path}: ${kept} of ${result.scored.length} tweets have p ≥ ${KEEP_THRESHOLD}` +
      (borderline
        ? `, ${borderline} more between ${BORDERLINE_THRESHOLD} and ${KEEP_THRESHOLD}`
        : '') +
      ' · rows sorted by p, highest first\n',
    exitCode: 0,
  }
}

function idArg(args: string[]) {
  const id = args.find((arg) => !arg.startsWith('--'))?.trim() ?? ''
  if (!TWEET_ID.test(id)) throw new UsageError('give a tweet id')
  return id
}

async function thread(
  state: CommandState,
  args: string[],
): Promise<CommandResult> {
  const id = idArg(args)
  state.calls += 1
  const result = await getThreadImpl({ tweetId: id }, state.limits)
  if ('notFound' in result) {
    state.summaries.push('Thread not found')
    return { stdout: '', stderr: `thread ${id}: not found\n`, exitCode: 1 }
  }
  const tweets = [result.tweet, ...result.conversation].filter(
    (tweet, index, all): tweet is AgentTweet =>
      Boolean(tweet) &&
      all.findIndex((other) => other?.id === tweet?.id) === index,
  )
  remember(state, tweets)
  state.summaries.push(`Read thread · ${plural(tweets.length, 'tweet')}`)
  return {
    stdout: formatRows(tweets.map((tweet) => toRow(tweet))),
    stderr: `thread ${id}: ${describe(tweets)}\n`,
    exitCode: 0,
  }
}

async function quotes(
  state: CommandState,
  args: string[],
): Promise<CommandResult> {
  const { positional, flags } = parseCommandArgs(args, ['limit'])
  const id = idArg(positional)
  state.calls += 1
  const result = await getQuotePostsImpl(
    { tweetId: id, limit: intFlag(flags.limit, 'limit', 25, 50) },
    state.limits,
  )
  remember(state, result.tweets)
  state.summaries.push(`Read quotes · ${plural(result.tweets.length, 'tweet')}`)
  return {
    stdout: formatRows(result.tweets.map((tweet) => toRow(tweet))),
    stderr: `quotes ${id}: ${plural(result.tweets.length, 'tweet')} of ${result.total}\n`,
    exitCode: 0,
  }
}

/**
 * The conversations around a scored file's strongest tweets: for each seed
 * (p ≥ --min-p, highest first), its thread and the tweets quoting it. A reply
 * or quote often carries a topic without naming it, so these are what the
 * agent scores next. Prints only tweets the file does not hold (the seeds are
 * in it), each once, in seed order and then the order each call returned.
 */
async function expand(
  state: CommandState,
  args: string[],
  readFile: (path: string) => Promise<string>,
): Promise<CommandResult> {
  const { positional, flags } = parseCommandArgs(args, [
    'min-p',
    'seeds',
    'limit',
  ])
  const [path] = positional
  if (!path || positional.length > 1) {
    throw new UsageError('give one scored tweet file')
  }
  const rawMinP = flags['min-p']
  const minP =
    rawMinP === undefined
      ? EXPAND_MIN_P
      : typeof rawMinP === 'string' && rawMinP.trim()
        ? Number(rawMinP)
        : NaN
  if (!Number.isFinite(minP) || minP < 0 || minP > 1) {
    throw new UsageError('--min-p must be between 0 and 1')
  }
  const maxSeeds = intFlag(flags.seeds, 'seeds', EXPAND_SEEDS, MAX_EXPAND_SEEDS)
  const limit = intFlag(flags.limit, 'limit', EXPAND_DEFAULT, MAX_COLLECT)

  const rows = await readRows(path, readFile)
  const inFile = new Set(rows.map((row) => row.id))
  const scores = new Map<string, number>()
  for (const { id, row } of rows) {
    const p = row?.p
    if (typeof p === 'number' && Number.isFinite(p) && !scores.has(id)) {
      scores.set(id, p)
    }
  }
  if (!scores.size) {
    throw new UsageError(
      `${path} has no p values; score it first (score ${path} "<yes/no question>")`,
    )
  }
  const seeds = Array.from(scores)
    .filter(([, p]) => p >= minP)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxSeeds)
    .map(([id]) => id)
  if (!seeds.length) {
    state.summaries.push(`Nothing to expand · no tweet has p ≥ ${minP}`)
    return {
      stdout: '',
      stderr: `expand ${path}: no tweet has p ≥ ${minP}; nothing to expand (lower --min-p)\n`,
      exitCode: 0,
    }
  }

  state.calls += 1
  const results = await inPool(seeds, EXPAND_CONCURRENCY, (tweetId) =>
    Promise.allSettled([
      getThreadImpl({ tweetId }, state.limits).then((thread) =>
        'notFound' in thread ? [] : [thread.tweet, ...thread.conversation],
      ),
      getQuotePostsImpl({ tweetId }, state.limits).then(
        (result) => result.tweets,
      ),
    ]),
  )
  const found = new Map<string, AgentTweet>()
  let failedSeeds = 0
  let answered = 0
  let firstError: unknown = null
  for (const calls of results) {
    if (calls.some((call) => call.status === 'rejected')) failedSeeds += 1
    for (const call of calls) {
      if (call.status === 'rejected') {
        firstError ??= call.reason
        continue
      }
      answered += 1
      for (const tweet of call.value) {
        if (!tweet || inFile.has(tweet.id) || found.has(tweet.id)) continue
        found.set(tweet.id, tweet)
      }
    }
  }
  // Every call failed: the command fails, and the shell command reads as the
  // archive being down unless another archive call in it answered (rebuilding
  // the file from the workspace is one). A few failed seeds are only counted.
  if (!answered) throw firstError

  const tweets = Array.from(found.values()).slice(0, limit)
  remember(state, tweets)
  state.summaries.push(
    `Expanded ${seeds.length === 1 ? "1 tweet's conversation" : `${plural(seeds.length, 'tweet')}' conversations`} · ${plural(tweets.length, 'tweet')}`,
  )
  return {
    stdout: formatRows(tweets.map((tweet) => toRow(tweet))),
    stderr:
      `expand ${path}: ${plural(seeds.length, 'seed')} · ${describe(tweets, 'new tweet')}` +
      (found.size > limit
        ? ` · capped at ${limit} of ${found.size}` +
          (limit < MAX_COLLECT ? ` (raise --limit, max ${MAX_COLLECT})` : '')
        : '') +
      (failedSeeds
        ? ` · ${failedSeeds} of ${plural(seeds.length, 'seed')} failed`
        : '') +
      '\n',
    exitCode: 0,
  }
}

async function tweetsById(
  state: CommandState,
  args: string[],
  stdin: Uint8Array | string,
): Promise<CommandResult> {
  const fromStdin =
    args.length === 0
      ? (typeof stdin === 'string' ? stdin : decodeBytesToUtf8(stdin as never))
          .split(/\s+/)
          .filter(Boolean)
      : args
  const ids = Array.from(new Set(fromStdin.filter((id) => TWEET_ID.test(id))))
  if (!ids.length) throw new UsageError('give tweet ids')
  if (ids.length > MAX_IDS_PER_COMMAND) {
    throw new UsageError(`at most ${MAX_IDS_PER_COMMAND} ids`)
  }
  state.calls += 1
  const tweets = await fetchTweets(state, ids)
  state.summaries.push(`Fetched ${plural(tweets.length, 'tweet')}`)
  return {
    stdout: formatRows(tweets.map((tweet) => toRow(tweet))),
    stderr: `tweets: ${plural(tweets.length, 'tweet')} of ${ids.length} found\n`,
    exitCode: 0,
  }
}

async function show(
  state: CommandState,
  args: string[],
): Promise<CommandResult> {
  const id = idArg(args)
  state.calls += 1
  const tweet =
    (await getTweetDetails([id], state.limits))[0] ??
    state.cache.get(id) ??
    null
  if (!tweet)
    return { stdout: '', stderr: `show ${id}: not found\n`, exitCode: 1 }
  remember(state, [tweet])
  const lines = [
    `@${tweet.username} · ${tweet.createdAt.slice(0, 10)} · ${tweet.likes} likes · id ${tweet.id}`,
    tweet.replyToTweetId
      ? `replying to ${tweet.replyToUsername ? `@${tweet.replyToUsername}` : tweet.replyToTweetId}`
      : null,
    '',
    tweet.text,
    tweet.quotedTweet
      ? `\nquotes @${tweet.quotedTweet.username} (${tweet.quotedTweet.id}): ${tweet.quotedTweet.text}`
      : null,
    tweet.media?.length
      ? `\n${plural(tweet.media.length, 'media item')}`
      : null,
  ].filter((line) => line !== null)
  return { stdout: `${lines.join('\n')}\n`, stderr: '', exitCode: 0 }
}

/**
 * Runs several command lines at once (a for loop runs them in turn): either
 * one template with {} filled by each word, or each argument as its own line.
 * Output comes back in argument order; the exit code is the highest.
 */
const par = defineCommand('par', async (args, ctx) => {
  const usage = (message: string) => ({
    stdout: '',
    stderr: `par: ${message}\n${USAGE.par}\n`,
    exitCode: 2,
  })
  if (!ctx.exec) return usage('cannot run commands here')
  const [first, ...rest] = args
  if (!first) return usage('give the commands to run')
  const lines = first.includes('{}')
    ? rest.map((word) => first.replaceAll('{}', word))
    : args
  if (!lines.length) return usage('give the words to fill {} with')
  if (lines.length > MAX_PAR) return usage(`at most ${MAX_PAR} commands`)
  const exec = ctx.exec
  const results = await inPool(lines, PAR_CONCURRENCY, (line) =>
    exec(line, { cwd: ctx.cwd }),
  )
  return {
    stdout: results.map((r) => r.stdout).join(''),
    stderr: results.map((r) => r.stderr).join(''),
    exitCode: Math.max(0, ...results.map((r) => r.exitCode)),
  }
})

/** The archive commands for one shell execution. */
export function archiveCommands(state: CommandState) {
  return [
    par,
    archiveCommand(state, 'timeline', (args) => timeline(state, args)),
    archiveCommand(state, 'search', (args) => search(state, args)),
    archiveCommand(state, 'semantic', (args) => semantic(state, args)),
    archiveCommand(state, 'people', (args) => people(state, args)),
    archiveCommand(state, 'score', (args, ctx) =>
      score(state, args, ctx.readFile),
    ),
    archiveCommand(state, 'thread', (args) => thread(state, args)),
    archiveCommand(state, 'quotes', (args) => quotes(state, args)),
    archiveCommand(state, 'expand', (args, ctx) =>
      expand(state, args, ctx.readFile),
    ),
    archiveCommand(state, 'tweets', (args, ctx) =>
      tweetsById(state, args, ctx.stdin),
    ),
    archiveCommand(state, 'show', (args) => show(state, args)),
  ]
}
