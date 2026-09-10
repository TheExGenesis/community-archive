/**
 * Writes chapter sections for the archive's most-followed accounts to
 * src/lib/metaTwitter/generatedSections.json.
 *
 *   pnpm script scripts/generate-profile-sections.ts \
 *     [--top 50] [--include exgenesis,...] [--only visakanv] \
 *     [--backfill-existing] [--tweet-pool path.json] [--audit path.json]
 *     [--force] [--concurrency 4] [--digest path.md] [--debug]
 *
 * For each account it pulls the bangers from the ClickHouse gateway, keeps
 * the most-quoted MAX_TWEETS_PER_YEAR per year, and asks the model once per
 * year for a thematic split; parseYearSections decides what survives.
 *
 * Append-only by default: a year that already has sections is left alone so
 * published titles and deep links stay stable across runs (the model is not
 * deterministic); years recorded empty are retried. --force regenerates every
 * year of the selected accounts.
 * Accounts that explicitly opted out of the directory are skipped.
 *
 * Needs in .env: CLICKHOUSE_ANALYTICS_API_URL, CLICKHOUSE_ANALYTICS_API_TOKEN,
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, OPENROUTER_API_KEY.
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  generateYearSections,
  topBangersByYear,
  type ModelSection,
  type SectionCandidateTweet,
} from '../src/lib/metaTwitter/sectionGeneration'
import { CURATED_SECTIONS } from '../src/lib/metaTwitter/curatedSections'
import type { GeneratedSectionsFile } from '../src/lib/metaTwitter/sectionConfig'

const MODEL = 'deepseek/deepseek-v4-flash-0731'
const OUT_PATH = path.resolve('src/lib/metaTwitter/generatedSections.json')

const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : (args[index + 1] ?? fallback)
}
const TOP = Number(flag('top', '50'))
const INCLUDE = flag('include', 'exgenesis').split(',').filter(Boolean)
const ONLY = flag('only', '').split(',').filter(Boolean)
const YEARS = flag('years', '').split(',').filter(Boolean).map(Number)
const FORCE = args.includes('--force')
const CONCURRENCY = Number(flag('concurrency', '4'))
const DIGEST = flag('digest', '')
const DEBUG = args.includes('--debug')
const BACKFILL = args.includes('--backfill-existing')
const POOL_PATH = flag('tweet-pool', '')
const AUDIT = flag('audit', 'profile-sections-audit.json')
if (!Number.isSafeInteger(CONCURRENCY) || CONCURRENCY < 1 || CONCURRENCY > 16)
  throw new Error('concurrency must be 1-16')
if (BACKFILL && FORCE)
  throw new Error('Backfill cannot regenerate frozen years')

const env = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}
const log = (...parts: unknown[]) => console.error(...parts)

interface Account {
  account_id: string
  username: string
  num_followers: number
}

async function supabase<T>(query: string): Promise<T> {
  const key = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const response = await fetch(
    `${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/${query}`,
    {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    },
  )
  if (!response.ok) throw new Error(`Supabase ${response.status} for ${query}`)
  return (await response.json()) as T
}

/** Top accounts by follower count plus explicit includes, minus opt-outs. */
async function selectAccounts(
  existing: GeneratedSectionsFile,
): Promise<Account[]> {
  const existingIds = Array.from(
    new Set([
      ...Object.entries(existing.accounts)
        .filter(([, entry]) =>
          Object.values(entry.years).some((year) => year.sections.length),
        )
        .map(([id]) => id),
      ...Object.keys(CURATED_SECTIONS),
    ]),
  )
  const select = 'select=account_id,username,num_followers'
  const top = BACKFILL
    ? []
    : await supabase<Account[]>(
        `account?${select}&order=num_followers.desc.nullslast&limit=${TOP}`,
      )
  const included =
    !BACKFILL && INCLUDE.length
      ? await supabase<Account[]>(
          `account?${select}&username=in.(${INCLUDE.join(',')})`,
        )
      : []
  const current: Account[] = []
  for (let index = 0; index < existingIds.length; index += 100) {
    current.push(
      ...(await supabase<Account[]>(
        `account?${select}&account_id=in.(${existingIds.slice(index, index + 100).join(',')})`,
      )),
    )
  }
  const byId = new Map<string, Account>()
  for (const account of [...top, ...included, ...current])
    byId.set(account.account_id, account)
  const ids = Array.from(byId.keys())
  if (!ids.length) return []
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
    .filter((account) => !ONLY.length || ONLY.includes(account.username))
}

const isoTimestamp = (value: string) =>
  new Date(
    value.includes('T') ? value : `${value.replace(' ', 'T')}Z`,
  ).toISOString()

/** Every banger of an account, walked page by page from the gateway. */
async function fetchBangers(
  accountId: string,
): Promise<SectionCandidateTweet[]> {
  const base = env('CLICKHOUSE_ANALYTICS_API_URL').replace(/\/$/, '')
  const tweets: SectionCandidateTweet[] = []
  let offset = 0
  const offsets = new Set<number>()
  for (;;) {
    if (offsets.has(offset)) throw new Error('Repeated banger cursor')
    offsets.add(offset)
    const params = new URLSearchParams({
      limit: '100',
      offset: String(offset),
      sort: 'quotes',
      target_account_id: accountId,
      min_quote_count: '2',
      exclude_self: 'true',
      target_ca_users_only: 'false',
      quote_ca_users_only: 'true',
    })
    const response = await fetch(`${base}/top-quotes?${params}`, {
      headers: {
        authorization: `Bearer ${env('CLICKHOUSE_ANALYTICS_API_TOKEN')}`,
      },
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok)
      throw new Error(`gateway ${response.status} for ${accountId}`)
    const body = (await response.json()) as {
      data: {
        tweetId: string
        createdAt: string
        fullText: string
        quoteCount: string | number
      }[]
      pagination?: { nextOffset?: number | null }
    }
    for (const row of body.data) {
      tweets.push({
        tweet_id: row.tweetId,
        created_at: isoTimestamp(row.createdAt),
        full_text: row.fullText,
        quote_count: Number(row.quoteCount),
      })
    }
    if (body.pagination?.nextOffset == null || !body.data.length) break
    offset = body.pagination.nextOffset
  }
  return tweets
}

async function requestSections(
  prompt: string,
  temperature: number,
): Promise<ModelSection[]> {
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
        max_tokens: 6000,
        // Some routed providers ignore JSON mode and return garbage; only use
        // ones that honor every parameter above.
        provider: { require_parameters: true },
        temperature,
        // Left to reason, this model spends its whole budget thinking.
        reasoning: { enabled: false },
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(120_000),
    },
  )
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`)
  const body = (await response.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[]
  }
  const choice = body.choices?.[0]
  if (choice?.finish_reason !== 'stop' || !choice.message?.content) {
    if (DEBUG) log(`    raw: ${choice?.message?.content?.slice(0, 400)}`)
    throw new Error(`model stopped early: ${choice?.finish_reason}`)
  }
  const parsed = JSON.parse(choice.message.content) as {
    sections?: ModelSection[]
  }
  if (!Array.isArray(parsed.sections)) {
    if (DEBUG) log(`    raw: ${choice.message.content.slice(0, 400)}`)
    throw new Error('no sections array')
  }
  return parsed.sections
}

async function pool<T>(items: T[], worker: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]!)
    }),
  )
}

/** Stable ordering keeps diffs readable: accounts by username, years descending. */
async function writeOutput(output: GeneratedSectionsFile) {
  const accounts = Object.fromEntries(
    Object.entries(output.accounts)
      .filter(([, entry]) => Object.keys(entry.years).length)
      .sort(([, a], [, b]) => a.username.localeCompare(b.username))
      .map(([id, entry]) => [
        id,
        {
          ...entry,
          years: Object.fromEntries(
            Object.entries(entry.years).sort(
              ([a], [b]) => Number(b) - Number(a),
            ),
          ),
        },
      ]),
  )
  await fs.writeFile(
    `${OUT_PATH}.tmp`,
    `${JSON.stringify({ model: output.model, accounts }, null, 2)}\n`,
  )
  await fs.rename(`${OUT_PATH}.tmp`, OUT_PATH)
}

async function main() {
  const existing = JSON.parse(
    await fs.readFile(OUT_PATH, 'utf8'),
  ) as GeneratedSectionsFile
  const output: GeneratedSectionsFile = {
    model: MODEL,
    accounts: { ...existing.accounts },
  }
  const poolData = POOL_PATH
    ? (JSON.parse(await fs.readFile(POOL_PATH, 'utf8')) as {
        source: string
        accounts: Record<string, Record<string, SectionCandidateTweet[]>>
      })
    : null
  if (poolData) {
    if (!poolData.source || !poolData.accounts)
      throw new Error('Invalid tweet pool')
    for (const years of Object.values(poolData.accounts)) {
      for (const [year, tweets] of Object.entries(years)) {
        if (
          !Array.isArray(tweets) ||
          tweets.length > 50 ||
          tweets.some(
            (tweet) =>
              !/^\d{1,20}$/.test(tweet.tweet_id) ||
              typeof tweet.full_text !== 'string' ||
              new Date(tweet.created_at).getUTCFullYear() !== Number(year) ||
              !Number.isFinite(tweet.favorite_count),
          )
        )
          throw new Error(`Invalid top-liked pool for year ${year}`)
      }
    }
  }
  const accounts = await selectAccounts(existing)
  log(`${accounts.length} accounts selected`)
  const audit: {
    accountId: string
    username: string
    year: number
    before: string
    after: string
    bangers: number
    candidates?: number
    responses?: number
    failures?: number
    error?: string
  }[] = []
  const allBangerIds = new Map<string, Set<string>>()
  const jobs: {
    account: Account
    year: number
    tweets: SectionCandidateTweet[]
  }[] = []
  await pool(accounts, async (account) => {
    try {
      const bangers = await fetchBangers(account.account_id)
      allBangerIds.set(
        account.account_id,
        new Set(bangers.map((tweet) => tweet.tweet_id)),
      )
      const byYear = topBangersByYear(bangers)
      const entry = output.accounts[account.account_id] ?? {
        username: account.username,
        years: {},
      }
      entry.username = account.username
      if (FORCE) entry.years = {}
      output.accounts[account.account_id] = entry
      const years = new Set([
        ...byYear.keys(),
        ...Object.keys(entry.years).map(Number),
        ...Object.keys(CURATED_SECTIONS[account.account_id] ?? {}).map(Number),
        ...Object.keys(poolData?.accounts[account.account_id] ?? {}).map(
          Number,
        ),
      ])
      for (const year of years) {
        if (YEARS.length && !YEARS.includes(year)) continue
        const tweets = byYear.get(year) ?? []
        if (
          entry.years[year]?.sections.length ||
          CURATED_SECTIONS[account.account_id]?.[year]?.length
        ) {
          audit.push({
            accountId: account.account_id,
            username: account.username,
            year,
            before: 'filled',
            after: 'frozen',
            bangers: tweets.length,
          })
        } else jobs.push({ account, year, tweets })
      }
      log(
        `@${account.username}: ${bangers.length} bangers, ${years.size} years audited`,
      )
    } catch (error) {
      audit.push({
        accountId: account.account_id,
        username: account.username,
        year: 0,
        before: 'unknown',
        after: 'data-failure',
        bangers: 0,
        error: (error as Error).message,
      })
    }
  })
  jobs.sort(
    (a, b) =>
      a.account.username.localeCompare(b.account.username) || b.year - a.year,
  )
  let done = 0
  // Serialize snapshots even while model requests run concurrently.
  let writes = Promise.resolve()
  await pool(jobs, async ({ account, year, tweets }) => {
    const before = existing.accounts[account.account_id]?.years[year]
      ? 'empty'
      : 'missing'
    const row = {
      accountId: account.account_id,
      username: account.username,
      year,
      before,
      bangers: tweets.length,
    }
    try {
      const result = await generateYearSections(
        year,
        tweets,
        async () => {
          const accountPool = poolData?.accounts[account.account_id]
          if (!accountPool)
            throw new Error(
              'No complete top-liked pool for account; provide --tweet-pool',
            )
          return accountPool[year] ?? []
        },
        requestSections,
      )
      audit.push({
        ...row,
        after: result.source,
        candidates: result.candidates,
        responses: result.responses,
        failures: result.failures,
      })
      // Provider errors are retryable, never recorded as an accepted empty split.
      if (result.sections.length || result.source !== 'provider-failure') {
        output.accounts[account.account_id]!.years[year] = {
          generatedAt: new Date().toISOString(),
          bangers: tweets.length,
          generationSource: result.source,
          ...(result.source === 'fallback'
            ? {
                supplementalTweetIds: result.sections
                  .flatMap((section) => section.tweetIds)
                  .filter(
                    (id) => !allBangerIds.get(account.account_id)!.has(id),
                  ),
              }
            : {}),
          sections: result.sections,
        }
        writes = writes.then(() => writeOutput(output))
        await writes
      }
      log(
        `[${++done}/${jobs.length}] @${account.username} ${year}: ${result.source} ${result.sections.map((section) => `"${section.title}" (${section.tweetIds.length})`).join(', ')}`,
      )
    } catch (error) {
      audit.push({
        ...row,
        after: 'data-failure',
        error: (error as Error).message,
      })
      log(
        `[${++done}/${jobs.length}] @${account.username} ${year}: ${(error as Error).message}`,
      )
    }
  })
  await writes
  await writeOutput(output)
  audit.sort((a, b) => a.username.localeCompare(b.username) || b.year - a.year)
  const count = (predicate: (row: (typeof audit)[number]) => boolean) =>
    audit.filter(predicate).length
  const summary = {
    accounts: accounts.length,
    yearsAudited: count((row) => row.year !== 0),
    filledBefore: count((row) => row.before === 'filled'),
    emptyBefore: count((row) => row.before === 'empty'),
    missingBefore: count((row) => row.before === 'missing'),
    filledByBangers: count((row) => row.after === 'bangers'),
    filledByFallback: count((row) => row.after === 'fallback'),
    filledAfter: count((row) =>
      ['frozen', 'bangers', 'fallback'].includes(row.after),
    ),
    remaining: count(
      (row) => !['frozen', 'bangers', 'fallback'].includes(row.after),
    ),
    failures: count((row) =>
      ['data-failure', 'provider-failure'].includes(row.after),
    ),
  }
  await fs.writeFile(
    AUDIT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: poolData?.source ?? null,
        summary,
        years: audit,
      },
      null,
      2,
    ) + '\n',
  )
  log(summary)
  if (summary.failures) process.exitCode = 1

  if (DIGEST) {
    const lines = ['# Generated profile sections', '']
    const written = JSON.parse(
      await fs.readFile(OUT_PATH, 'utf8'),
    ) as GeneratedSectionsFile
    for (const [id, entry] of Object.entries(written.accounts)) {
      lines.push(`## @${entry.username} (${id})`, '')
      for (const [year, data] of Object.entries(entry.years)) {
        lines.push(
          data.sections.length
            ? `- **${year}** (${data.bangers} bangers): ${data.sections.map((s) => `"${s.title}" (${s.tweetIds.length})`).join(' · ')} · other`
            : `- **${year}** (${data.bangers} bangers): _no sections_`,
        )
      }
      lines.push('')
    }
    await fs.writeFile(DIGEST, `${lines.join('\n')}\n`)
    log(`wrote ${DIGEST}`)
  }
}

main().catch((error) => {
  log(error)
  process.exit(1)
})
