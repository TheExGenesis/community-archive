import { decodeBytesToUtf8, defineCommand } from 'just-bash'
import { ScoringError } from '../classifier'
import type { RunLimits } from '../deadline'
import { getTweetDetails, getTweetsByIds, searchTweets } from '../gateway'
import {
  BORDERLINE_THRESHOLD,
  KEEP_THRESHOLD,
  MAX_COLLECT,
  collectAcrossTerms,
  findPeopleImpl,
  getQuotePostsImpl,
  getThreadImpl,
  scoreWithParents,
} from '../toolImpl'
import {
  MAX_SEMANTIC_CALLS_PER_RUN,
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
const PAGE = 100
const MAX_IDS_PER_COMMAND = MAX_COLLECT

/** Fetches tweets by id through the gateway, using what this run has seen. */
export async function fetchTweets(
  state: CommandState,
  ids: string[],
): Promise<AgentTweet[]> {
  const missing = ids.filter((id) => !state.cache.has(id))
  for (let i = 0; i < missing.length; i += 100) {
    const batch = await getTweetsByIds(missing.slice(i, i + 100), state.limits)
    for (const tweet of batch) state.cache.set(tweet.id, tweet)
  }
  return ids
    .map((id) => state.cache.get(id))
    .filter((tweet): tweet is AgentTweet => Boolean(tweet))
}

function remember(state: CommandState, tweets: AgentTweet[]) {
  for (const tweet of tweets) state.cache.set(tweet.id, tweet)
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
function describe(tweets: AgentTweet[]) {
  const authors = new Set(tweets.map((tweet) => tweet.username)).size
  return [
    plural(tweets.length, 'tweet'),
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
      return await run(args, {
        stdin: ctx.stdin as unknown as Uint8Array,
        readFile: (path) =>
          ctx.fs.readFile(
            path.startsWith('/')
              ? path
              : `${ctx.cwd.replace(/\/$/, '')}/${path}`,
          ),
      })
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
    'usage: search <words> [--any w1,w2] [--all] [--from @handle] [--reply-to @handle] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--sort newest|oldest|likes|reposts] [--limit N]',
  semantic:
    'usage: semantic "<what the tweets say, in plain words>" [--from @handle] [--k N] [--threshold 0-1]',
  people: 'usage: people <name or handle>',
  score:
    'usage: score <file> "<yes/no question about one tweet>" [--no-parent]',
  thread: 'usage: thread <tweet id>',
  quotes: 'usage: quotes <tweet id> [--limit N]',
  tweets: 'usage: tweets <tweet id>... (or ids on stdin)',
  read: 'usage: read <tweet id>',
}

async function search(
  state: CommandState,
  args: string[],
): Promise<CommandResult> {
  const { positional, flags } = parseCommandArgs(
    args,
    ['any', 'from', 'reply-to', 'since', 'until', 'sort', 'limit'],
    ['all'],
  )
  const query = positional.join(' ').trim()
  if (!query) throw new UsageError('give the words to search for')
  const sort = flags.sort
  if (
    sort !== undefined &&
    !['newest', 'oldest', 'likes', 'reposts'].includes(String(sort))
  ) {
    throw new UsageError('--sort must be newest, oldest, likes or reposts')
  }
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

  state.calls += 1
  let tweets: AgentTweet[] = []
  let more = false
  if (alternatives.length) {
    const terms = Array.from(new Set([query, ...alternatives])).slice(0, 9)
    const { collected, capped } = await collectAcrossTerms(
      terms,
      limit,
      { since, until, fromUser },
      state.limits,
    )
    tweets = Array.from(collected.values())
    more = capped
  } else {
    let offset: number | null = 0
    while (offset !== null && tweets.length < limit) {
      const page: { tweets: AgentTweet[]; nextOffset: number | null } =
        await searchTweets(
          {
            query,
            mode: flags.all ? 'all' : undefined,
            fromUser,
            replyToUser,
            since,
            until,
            sort: sort as 'newest' | 'oldest' | 'likes' | 'reposts' | undefined,
            limit: Math.min(PAGE, limit - tweets.length),
            offset,
          },
          state.limits,
        )
      tweets.push(...page.tweets)
      offset = page.tweets.length ? page.nextOffset : null
    }
    more = offset !== null
    tweets = tweets.slice(0, limit)
  }
  remember(state, tweets)
  const what = [
    alternatives.length
      ? [query, ...alternatives].map(quote).join(' or ')
      : quote(query),
    fromUser ? `from @${fromUser}` : null,
    replyToUser ? `replying to @${replyToUser}` : null,
  ]
    .filter(Boolean)
    .join(' ')
  state.summaries.push(`Searched ${what} · ${plural(tweets.length, 'tweet')}`)
  return {
    stdout: formatRows(tweets.map((tweet) => toRow(tweet))),
    stderr: `search ${what}: ${describe(tweets)}${more ? ` · more exist (raise --limit, max ${MAX_COLLECT})` : ''}\n`,
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
      k: intFlag(flags.k, 'k', SEARCH_DEFAULT, MAX_COLLECT),
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

async function readIds(
  path: string,
  readFile: (path: string) => Promise<string>,
): Promise<string[]> {
  const content = await readFile(path).catch(() => {
    throw new UsageError(`no such file: ${path}`)
  })
  const rows = parseRowFile(content)
  if (!rows) throw new UsageError(`${path} is not a tweet file`)
  return uniqueIds(rows)
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

async function read(
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
    return { stdout: '', stderr: `read ${id}: not found\n`, exitCode: 1 }
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

/** The archive commands for one shell execution. */
export function archiveCommands(state: CommandState) {
  return [
    archiveCommand(state, 'search', (args) => search(state, args)),
    archiveCommand(state, 'semantic', (args) => semantic(state, args)),
    archiveCommand(state, 'people', (args) => people(state, args)),
    archiveCommand(state, 'score', (args, ctx) =>
      score(state, args, ctx.readFile),
    ),
    archiveCommand(state, 'thread', (args) => thread(state, args)),
    archiveCommand(state, 'quotes', (args) => quotes(state, args)),
    archiveCommand(state, 'tweets', (args, ctx) =>
      tweetsById(state, args, ctx.stdin),
    ),
    archiveCommand(state, 'read', (args) => read(state, args)),
  ]
}
