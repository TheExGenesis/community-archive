/**
 * Writes chapter sections for the archive's most-followed accounts to
 * src/lib/metaTwitter/generatedSections.json.
 *
 *   pnpm script scripts/generate-profile-sections.ts \
 *     [--top 50] [--include exgenesis,...] [--only visakanv] \
 *     [--force] [--concurrency 4] [--digest path.md] [--debug]
 *
 * For each account it pulls the bangers from the ClickHouse gateway, keeps
 * the most-quoted MAX_TWEETS_PER_YEAR per year, and asks the model once per
 * year for a thematic split; parseYearSections decides what survives.
 *
 * Append-only by default: a year that already has an entry is left alone so
 * published titles and deep links stay stable across runs (the model is not
 * deterministic). --force regenerates every year of the selected accounts.
 * Accounts that explicitly opted out of the directory are skipped.
 *
 * Needs in .env: CLICKHOUSE_ANALYTICS_API_URL, CLICKHOUSE_ANALYTICS_API_TOKEN,
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, OPENROUTER_API_KEY.
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  MIN_BANGERS,
  parseYearSections,
  topBangersByYear,
  yearSectionPrompt,
  type ModelSection,
  type SectionCandidateTweet,
} from '../src/lib/metaTwitter/sectionGeneration'
import type { ChapterSection } from '../src/lib/metaTwitter/chapterSections'
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
const FORCE = args.includes('--force')
const CONCURRENCY = Number(flag('concurrency', '4'))
const DIGEST = flag('digest', '')
const DEBUG = args.includes('--debug')

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
async function selectAccounts(): Promise<Account[]> {
  const select = 'select=account_id,username,num_followers'
  const top = await supabase<Account[]>(
    `account?${select}&order=num_followers.desc.nullslast&limit=${TOP}`,
  )
  const included = INCLUDE.length
    ? await supabase<Account[]>(
        `account?${select}&username=in.(${INCLUDE.join(',')})`,
      )
    : []
  const byId = new Map<string, Account>()
  for (const account of [...top, ...included])
    byId.set(account.account_id, account)
  const ids = Array.from(byId.keys())
  // The directory view hides explicit opt-outs, so absence means "skip".
  const listed = new Set(
    (
      await supabase<{ account_id: string }[]>(
        `user_directory?select=account_id&account_id=in.(${ids.join(',')})`,
      )
    ).map((row) => row.account_id),
  )
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
  for (;;) {
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
    OUT_PATH,
    `${JSON.stringify({ model: output.model, accounts }, null, 2)}\n`,
  )
}

async function main() {
  const existing = JSON.parse(
    await fs.readFile(OUT_PATH, 'utf8'),
  ) as GeneratedSectionsFile
  const output: GeneratedSectionsFile = {
    model: MODEL,
    accounts: { ...existing.accounts },
  }
  const accounts = await selectAccounts()
  log(`${accounts.length} accounts selected`)

  const jobs: {
    account: Account
    year: number
    tweets: SectionCandidateTweet[]
  }[] = []
  await pool(accounts, async (account) => {
    const bangers = await fetchBangers(account.account_id)
    const byYear = topBangersByYear(bangers)
    const entry = output.accounts[account.account_id] ?? {
      username: account.username,
      years: {},
    }
    entry.username = account.username
    if (FORCE) entry.years = {}
    output.accounts[account.account_id] = entry
    let queued = 0
    byYear.forEach((tweets, year) => {
      if (tweets.length < MIN_BANGERS || entry.years[year]) return
      jobs.push({ account, year, tweets })
      queued += 1
    })
    log(
      `@${account.username}: ${bangers.length} bangers, ${queued} years to generate`,
    )
  })

  jobs.sort(
    (a, b) =>
      a.account.username.localeCompare(b.account.username) || b.year - a.year,
  )
  let done = 0
  await pool(jobs, async ({ account, year, tweets }) => {
    const label = `@${account.username} ${year}`
    try {
      const prompt = yearSectionPrompt(year, tweets)
      let sections: ChapterSection[] = []
      // The model misreads the rules in a different way each call, so an
      // empty year gets two more, warmer samples before we accept it.
      for (const temperature of [0, 0.7, 0.7]) {
        let raw: ModelSection[]
        try {
          raw = await requestSections(prompt, temperature)
        } catch (error) {
          log(`    ${label} t=${temperature}: ${(error as Error).message}`)
          continue
        }
        sections = parseYearSections(raw, tweets)
        if (DEBUG) {
          const known = new Set(tweets.map((tweet) => tweet.tweet_id))
          const keptIds = new Set(sections.flatMap((s) => s.tweetIds))
          for (const candidate of raw) {
            const ids = Array.isArray(candidate?.tweet_ids)
              ? candidate.tweet_ids
              : []
            const kept = ids.length > 0 && ids.every((id) => keptIds.has(id))
            log(
              `    t=${temperature} ${kept ? 'kept' : 'DROP'} "${candidate?.title}" ids=${ids.length} known=${ids.filter((id) => known.has(id)).length}`,
            )
          }
        }
        if (sections.length) break
      }
      output.accounts[account.account_id]!.years[year] = {
        generatedAt: new Date().toISOString(),
        bangers: tweets.length,
        sections,
      }
      await writeOutput(output)
      log(
        `[${++done}/${jobs.length}] ${label}: ${sections.length ? sections.map((s) => `"${s.title}" (${s.tweetIds.length})`).join(', ') : 'no sections'}`,
      )
    } catch (error) {
      log(
        `[${++done}/${jobs.length}] ${label}: FAILED ${(error as Error).message}`,
      )
    }
  })

  await writeOutput(output)
  log(`wrote ${OUT_PATH}`)

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
