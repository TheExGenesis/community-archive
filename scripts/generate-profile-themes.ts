/**
 * Writes each account's top five themes per calendar year (UTC), and across
 * all time, to src/lib/metaTwitter/generatedThemes.json for the profile
 * stats band.
 *
 *   npx tsx scripts/generate-profile-themes.ts \
 *     [--top 50] [--include exgenesis,...] [--only christineist,...] \
 *     [--years 2026,all] [--force] [--concurrency 4] [--debug]
 *
 * --years takes years and/or "all", defaulting to the current UTC year and
 * all time. For each (account, period) it reads the account's tweets for
 * that period from Supabase,
 * keeps originals, quote tweets and self-replies (consideredPosts), and asks
 * the model once for five themes with counting keywords. postCount is then
 * counted locally over every considered post (countThemes), so a sampled
 * prompt never skews the numbers. Years under MIN_YEAR_POSTS are skipped.
 *
 * Append-only by default: a year that already has themes is left alone so
 * the band stays stable across runs (the model is not deterministic); --force
 * regenerates the selected years. The JSON is rewritten after every year.
 * Accounts that explicitly opted out of the directory are skipped.
 *
 * Needs in .env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * OPENROUTER_API_KEY.
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  MIN_YEAR_POSTS,
  consideredPosts,
  generateYearThemes,
  type ThemeSourceTweet,
} from '../src/lib/metaTwitter/themeGeneration'
import type { GeneratedThemesFile } from '../src/lib/metaTwitter/profileThemes'

const MODEL = 'deepseek/deepseek-v4-flash-0731'
const OUT_PATH = path.resolve('src/lib/metaTwitter/generatedThemes.json')
const PAGE_SIZE = 1000

const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : (args[index + 1] ?? fallback)
}
const THIS_YEAR = new Date().getUTCFullYear()
const TOP = Number(flag('top', '50'))
const INCLUDE = flag('include', 'exgenesis').split(',').filter(Boolean)
const ONLY = flag('only', '').split(',').filter(Boolean)
const ALL_TIME = 'all'
type Period = number | typeof ALL_TIME
const YEARS: Period[] = flag('years', `${THIS_YEAR},${ALL_TIME}`)
  .split(',')
  .filter(Boolean)
  .map((value) => (value === ALL_TIME ? ALL_TIME : Number(value)))
const FORCE = args.includes('--force')
const CONCURRENCY = Number(flag('concurrency', '4'))
const DEBUG = args.includes('--debug')
if (!Number.isSafeInteger(CONCURRENCY) || CONCURRENCY < 1 || CONCURRENCY > 16)
  throw new Error('concurrency must be 1-16')
if (
  !YEARS.length ||
  YEARS.some(
    (year) => year !== ALL_TIME && !(year >= 2006 && year <= THIS_YEAR),
  )
)
  throw new Error(
    `--years must be "all" or years between 2006 and ${THIS_YEAR}`,
  )
/** JSON keys and sort order: "all" first, then years descending. */
const periodRank = (period: string | Period) =>
  period === ALL_TIME ? Infinity : Number(period)
for (const name of [...ONLY, ...INCLUDE])
  if (!/^\w{1,15}$/.test(name)) throw new Error(`Invalid username: ${name}`)

const env = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}
const log = (...parts: unknown[]) => console.error(...parts)

interface Account {
  account_id: string
  username: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A PostgREST read, retried with backoff: one slow page shouldn't sink an account. */
async function supabase<T>(query: string, attempts = 3): Promise<T> {
  const key = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(
        `${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/${query}`,
        {
          headers: { apikey: key, authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(60_000),
        },
      )
      if (!response.ok)
        throw new Error(`Supabase ${response.status} for ${query}`)
      return (await response.json()) as T
    } catch (error) {
      if (attempt >= attempts) throw error
      await sleep(2_000 * attempt)
    }
  }
}

/** --only accounts, else top accounts by followers plus --include, minus opt-outs. */
async function selectAccounts(): Promise<Account[]> {
  const select = 'select=account_id,username'
  const found = ONLY.length
    ? await supabase<Account[]>(
        `account?${select}&username=in.(${ONLY.join(',')})`,
      )
    : [
        ...(await supabase<Account[]>(
          `account?${select}&order=num_followers.desc.nullslast&limit=${TOP}`,
        )),
        ...(INCLUDE.length
          ? await supabase<Account[]>(
              `account?${select}&username=in.(${INCLUDE.join(',')})`,
            )
          : []),
      ]
  const byId = new Map(found.map((account) => [account.account_id, account]))
  for (const name of ONLY)
    if (!found.some((account) => account.username === name))
      log(`skip @${name}: no such account`)
  const ids = Array.from(byId.keys())
  // The directory view hides explicit opt-outs, so absence means "skip".
  const listed = new Set<string>()
  for (let index = 0; index < ids.length; index += 100) {
    for (const row of await supabase<{ account_id: string }[]>(
      `user_directory?select=account_id&account_id=in.(${ids.slice(index, index + 100).join(',')})`,
    ))
      listed.add(row.account_id)
  }
  return ids
    .filter((id) => {
      if (listed.has(id)) return true
      log(`skip @${byId.get(id)!.username}: not in the public directory`)
      return false
    })
    .map((id) => byId.get(id)!)
}

/**
 * An account's tweets in one UTC year, keyset-paginated by tweet_id. Replies
 * to other people are filtered out server-side, since consideredPosts drops
 * them anyway; that roughly halves the rows read.
 */
async function fetchYearTweets(
  accountId: string,
  year: number,
): Promise<ThemeSourceTweet[]> {
  const rows: ThemeSourceTweet[] = []
  let cursor = ''
  for (;;) {
    const params = [
      'select=tweet_id,created_at,full_text,favorite_count,reply_to_tweet_id,reply_to_user_id,is_tombstone',
      `account_id=eq.${accountId}`,
      `or=(reply_to_user_id.is.null,reply_to_user_id.eq.${accountId})`,
      `created_at=gte.${year}-01-01T00:00:00Z`,
      `created_at=lt.${year + 1}-01-01T00:00:00Z`,
      ...(cursor ? [`tweet_id=gt.${cursor}`] : []),
      'order=tweet_id.asc',
      `limit=${PAGE_SIZE}`,
    ]
    const page = await supabase<ThemeSourceTweet[]>(
      `tweets?${params.join('&')}`,
    )
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    const next = page[page.length - 1]!.tweet_id
    if (next === cursor) throw new Error('Repeated tweet cursor')
    cursor = next
  }
  return rows
}

/**
 * A period's tweets. All time is read year by year: bounded queries stay fast
 * on huge accounts where one unbounded scan times out.
 */
async function fetchPeriodTweets(
  accountId: string,
  period: Period,
): Promise<ThemeSourceTweet[]> {
  if (period !== ALL_TIME) return fetchYearTweets(accountId, period)
  const rows: ThemeSourceTweet[] = []
  for (let year = 2006; year <= THIS_YEAR; year++)
    rows.push(...(await fetchYearTweets(accountId, year)))
  return rows
}

async function requestThemes(
  prompt: string,
  temperature: number,
): Promise<string> {
  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env('OPENROUTER_API_KEY')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        // Some routed providers ignore JSON mode and return garbage; only use
        // ones that honor every parameter above.
        provider: { require_parameters: true },
        temperature,
        // Left to reason, this model spends its whole budget thinking.
        reasoning: { enabled: false },
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(180_000),
    },
  )
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`)
  const body = (await response.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const choice = body.choices?.[0]
  if (DEBUG)
    log(
      `    t=${temperature} tokens in/out: ${body.usage?.prompt_tokens}/${body.usage?.completion_tokens}\n    raw: ${choice?.message?.content}`,
    )
  if (choice?.finish_reason !== 'stop' || !choice.message?.content)
    throw new Error(`model stopped early: ${choice?.finish_reason}`)
  return choice.message.content
}

async function pool<T>(items: T[], worker: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]!)
    }),
  )
}

/** Stable ordering keeps diffs readable: accounts by id, then periods. */
async function writeOutput(output: GeneratedThemesFile) {
  const sorted = Object.fromEntries(
    Object.entries(output)
      .filter(([, years]) => Object.keys(years).length)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, years]) => [
        id,
        Object.fromEntries(
          Object.entries(years).sort(
            ([a], [b]) => periodRank(b) - periodRank(a),
          ),
        ),
      ]),
  )
  await fs.writeFile(`${OUT_PATH}.tmp`, `${JSON.stringify(sorted, null, 2)}\n`)
  await fs.rename(`${OUT_PATH}.tmp`, OUT_PATH)
}

async function main() {
  const output = JSON.parse(
    await fs.readFile(OUT_PATH, 'utf8'),
  ) as GeneratedThemesFile
  const accounts = await selectAccounts()
  log(`${accounts.length} accounts selected, years ${YEARS.join(', ')}`)
  const jobs = accounts
    .flatMap((account) => YEARS.map((year) => ({ account, year })))
    .filter(({ account, year }) => {
      if (FORCE || !output[account.account_id]?.[String(year)]) return true
      log(`@${account.username} ${year}: already has themes, kept`)
      return false
    })
    .sort(
      (a, b) =>
        a.account.username.localeCompare(b.account.username) ||
        periodRank(b.year) - periodRank(a.year),
    )
  let done = 0
  let failures = 0
  // Serialize snapshots even while requests run concurrently.
  let writes = Promise.resolve()
  await pool(jobs, async ({ account, year }) => {
    const tag = `[${++done}/${jobs.length}] @${account.username} ${year}`
    try {
      const rows = await fetchPeriodTweets(account.account_id, year)
      const posts = consideredPosts(
        rows,
        account.account_id,
        year === ALL_TIME ? null : year,
      )
      if (posts.length < MIN_YEAR_POSTS) {
        log(`${tag}: ${posts.length} posts of ${rows.length} tweets, skipped`)
        return
      }
      const { result, sampled, promptChars, responses } =
        await generateYearThemes(
          year === ALL_TIME ? null : year,
          posts,
          requestThemes,
        )
      if (!result?.themes.length) {
        failures++
        log(
          `${tag}: no usable themes (${responses} replies, ${posts.length} posts)`,
        )
        return
      }
      output[account.account_id] = {
        ...output[account.account_id],
        [String(year)]: result,
      }
      writes = writes.then(() => writeOutput(output))
      await writes
      log(
        `${tag}: ${posts.length} posts of ${rows.length} tweets (prompt ${sampled} posts, ${Math.round(promptChars / 1000)}K chars)`,
      )
      for (const theme of result.themes)
        log(
          `    ${theme.label}: ${theme.postCount}/${result.totalPosts} (${Math.round((100 * theme.postCount) / result.totalPosts)}%) - ${theme.description}`,
        )
    } catch (error) {
      failures++
      log(`${tag}: ${(error as Error).message}`)
    }
  })
  await writes
  if (failures) process.exitCode = 1
}

main().catch((error) => {
  log(error)
  process.exit(1)
})
