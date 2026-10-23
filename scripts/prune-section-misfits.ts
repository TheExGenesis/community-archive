/**
 * Moves tweets that don't cleanly fit their section's label to the catch-all,
 * in src/lib/metaTwitter/generatedSections.json.
 *
 *   pnpm script scripts/prune-section-misfits.ts \
 *     [--only visakanv,...] [--years 2023,...] [--targets visakanv:2023,...]
 *     [--force] [--dry-run] [--audit path.json] [--texts cache.json]
 *     [--concurrency 4] [--debug]
 *
 * One model call per (account, year) shows every section's label and
 * tweets and asks which tweets miss their label; a second call shows only
 * those proposals and keeps any it can tie to the label. parseMisfits,
 * parseMisfitReview and pruneSection (sectionGeneration.ts) decide what is
 * removed. A removed tweet
 * leaves only its section's tweetIds: bangers stay in the year's pool, and
 * removed supplements stay in supplementalTweetIds, so both still show under
 * "other". The title tweet is never removed.
 *
 * Years pruned before (misfitsPrunedAt) are skipped unless --force, and
 * curated years are always skipped since curated sections win. --dry-run
 * writes only the audit, which records every decision.
 *
 * Needs in .env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * CLICKHOUSE_ANALYTICS_API_URL, CLICKHOUSE_ANALYTICS_API_TOKEN,
 * OPENROUTER_API_KEY.
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  misfitPrompt,
  misfitReviewPrompt,
  parseMisfitReview,
  parseMisfits,
  pruneSection,
  sectionTitleTweetId,
  type MisfitSection,
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
const list = (name: string) => flag(name, '').split(',').filter(Boolean)
const ONLY = list('only')
const YEARS = list('years').map(Number)
const TARGETS = list('targets')
const FORCE = args.includes('--force')
const DRY_RUN = args.includes('--dry-run')
const DEBUG = args.includes('--debug')
const AUDIT = flag('audit', 'profile-section-misfits-audit.json')
const TEXTS = flag('texts', '')
const CONCURRENCY = Number(flag('concurrency', '4'))
if (!Number.isSafeInteger(CONCURRENCY) || CONCURRENCY < 1 || CONCURRENCY > 16)
  throw new Error('concurrency must be 1-16')

const env = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}
const log = (...parts: unknown[]) => console.error(...parts)
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Retries a flaky network step; connections from some hosts drop ~10%. */
async function retry<T>(label: string, run: () => Promise<T>, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= tries) throw error
      if (DEBUG) log(`  retry ${label}: ${(error as Error).message}`)
      await pause(1000 * attempt)
    }
  }
}

/** Texts from Supabase's tweets table, in batches. */
async function supabaseTexts(ids: string[]) {
  const key = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const texts = new Map<string, string>()
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100)
    const rows = await retry('supabase', async () => {
      const response = await fetch(
        `${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/tweets?select=tweet_id,full_text&tweet_id=in.(${batch.join(',')})`,
        {
          headers: { apikey: key, authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(30_000),
        },
      )
      if (!response.ok) throw new Error(`Supabase ${response.status}`)
      return (await response.json()) as {
        tweet_id: string
        full_text: string
      }[]
    })
    for (const row of rows) texts.set(row.tweet_id, row.full_text)
  }
  return texts
}

/**
 * One tweet's text from the gateway, which is what the page renders and so
 * what a title was matched against. Null when the gateway has no such tweet.
 */
async function gatewayText(id: string): Promise<string | null> {
  const base = env('CLICKHOUSE_ANALYTICS_API_URL').replace(/\/$/, '')
  return retry(`gateway ${id}`, async () => {
    const response = await fetch(`${base}/tweet/${id}`, {
      headers: {
        authorization: `Bearer ${env('CLICKHOUSE_ANALYTICS_API_TOKEN')}`,
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`gateway ${response.status}`)
    const body = (await response.json()) as {
      data?: { tweet?: { fullText?: string } }
    }
    return body.data?.tweet?.fullText ?? null
  })
}

async function requestVerdicts(prompt: string) {
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
        temperature: 0,
        // Left to reason, this model spends its whole budget thinking.
        reasoning: { enabled: false },
        response_format: { type: 'json_object' },
        usage: { include: true },
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(120_000),
    },
  )
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`)
  const body = (await response.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[]
    usage?: { cost?: number }
  }
  const choice = body.choices?.[0]
  if (choice?.finish_reason !== 'stop' || !choice.message?.content) {
    if (DEBUG) log(`    raw: ${choice?.message?.content?.slice(0, 400)}`)
    throw new Error(`model stopped early: ${choice?.finish_reason}`)
  }
  const parsed = JSON.parse(choice.message.content) as { posts?: unknown }
  if (!Array.isArray(parsed.posts)) {
    if (DEBUG) log(`    raw: ${choice.message.content.slice(0, 400)}`)
    throw new Error('no posts array')
  }
  return { parsed, cost: body.usage?.cost ?? 0 }
}

async function pool<T>(items: T[], worker: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]!)
    }),
  )
}

const snippet = (text: string | undefined) =>
  text === undefined ? null : text.replace(/\s+/g, ' ').trim().slice(0, 280)

interface SectionAudit {
  slug: string
  label: string
  title: string
  size: number
  decision: 'unchanged' | 'pruned' | 'flagged' | 'skipped'
  why?: string
  removed: { id: string; reason: string; text: string | null }[]
  /** Proposed misfits the second look kept in place, with the tie it named. */
  rescued?: { id: string; reason: string; tie: string; text: string | null }[]
  kept: { id: string; title?: true; text: string | null }[]
}

async function main() {
  const file = JSON.parse(
    await fs.readFile(OUT_PATH, 'utf8'),
  ) as GeneratedSectionsFile
  const jobs: { accountId: string; username: string; year: string }[] = []
  const audit: {
    accountId: string
    username: string
    year: number
    status: string
    error?: string
    cost?: number
    judged?: string
    rejected?: { id: unknown; reason: string }[]
    sections?: SectionAudit[]
  }[] = []
  for (const [accountId, account] of Object.entries(file.accounts)) {
    if (ONLY.length && !ONLY.includes(account.username)) continue
    for (const [year, entry] of Object.entries(account.years)) {
      if (!entry.sections.length) continue
      if (YEARS.length && !YEARS.includes(Number(year))) continue
      if (TARGETS.length && !TARGETS.includes(`${account.username}:${year}`))
        continue
      const row = { accountId, username: account.username, year: Number(year) }
      if (CURATED_SECTIONS[accountId]?.[Number(year)]?.length)
        audit.push({ ...row, status: 'skipped-curated' })
      else if (entry.misfitsPrunedAt && !FORCE)
        audit.push({ ...row, status: 'skipped-already-pruned' })
      else jobs.push({ accountId, username: account.username, year })
    }
  }
  log(`${jobs.length} account-years to check`)

  // Texts: a cache, then Supabase in bulk, then the gateway for whatever is
  // missing or doesn't contain its section's title.
  const texts = new Map<string, string>(
    TEXTS
      ? Object.entries(
          JSON.parse(
            await fs.readFile(TEXTS, 'utf8').catch(() => '{}'),
          ) as Record<string, string>,
        )
      : [],
  )
  const sectionsOf = (job: (typeof jobs)[number]) =>
    file.accounts[job.accountId]!.years[job.year]!.sections
  const wanted = jobs.flatMap((job) =>
    sectionsOf(job).flatMap((section) => section.tweetIds),
  )
  const fromSupabase = await supabaseTexts(
    wanted.filter((id) => !texts.has(id)),
  )
  fromSupabase.forEach((text, id) => texts.set(id, text))
  const recheck = jobs.flatMap((job) =>
    sectionsOf(job).flatMap((section) =>
      sectionTitleTweetId(section, texts)
        ? section.tweetIds.filter((id) => !texts.has(id))
        : section.tweetIds,
    ),
  )
  log(
    `${texts.size} texts known; asking the gateway for ${recheck.length} more`,
  )
  await pool(recheck, async (id) => {
    try {
      const text = await gatewayText(id)
      if (text !== null) texts.set(id, text)
    } catch (error) {
      log(`  no text for ${id}: ${(error as Error).message}`)
    }
  })
  if (TEXTS)
    await fs.writeFile(TEXTS, JSON.stringify(Object.fromEntries(texts)))

  let done = 0
  let cost = 0
  let writes = Promise.resolve()
  const write = () =>
    fs
      .writeFile(`${OUT_PATH}.tmp`, `${JSON.stringify(file, null, 2)}\n`)
      .then(() => fs.rename(`${OUT_PATH}.tmp`, OUT_PATH))
  await pool(jobs, async (job) => {
    const entry = file.accounts[job.accountId]!.years[job.year]!
    const row = {
      accountId: job.accountId,
      username: job.username,
      year: Number(job.year),
    }
    const sectionAudits: SectionAudit[] = []
    const candidates: { index: number; section: MisfitSection }[] = []
    entry.sections.forEach((section, index) => {
      const titleTweetId = sectionTitleTweetId(section, texts)
      const base = {
        slug: section.slug,
        label: section.label ?? section.title,
        title: section.title,
        size: section.tweetIds.length,
        removed: [],
        kept: section.tweetIds.map((id) => ({
          id,
          ...(id === titleTweetId ? { title: true as const } : {}),
          text: snippet(texts.get(id)),
        })),
      }
      if (!titleTweetId || !section.label) {
        sectionAudits.push({
          ...base,
          decision: 'skipped',
          why: section.label ? 'title tweet not found' : 'no label',
        })
        return
      }
      sectionAudits.push({ ...base, decision: 'unchanged' })
      candidates.push({
        index,
        section: {
          label: section.label,
          titleTweetId,
          tweets: section.tweetIds
            .filter((id) => texts.has(id))
            .map((id) => ({ tweet_id: id, full_text: texts.get(id)! })),
        },
      })
    })
    if (!candidates.length) {
      audit.push({
        ...row,
        status: 'skipped-no-checkable-sections',
        sections: sectionAudits,
      })
      log(
        `[${++done}/${jobs.length}] @${job.username} ${job.year}: nothing checkable`,
      )
      return
    }
    const shownSections = candidates.map(({ section }) => section)
    let yearCost = 0
    let proposed: ReturnType<typeof parseMisfits>
    let review: ReturnType<typeof parseMisfitReview>
    try {
      const first = await retry(
        'model',
        () => requestVerdicts(misfitPrompt(Number(job.year), shownSections)),
        3,
      )
      yearCost += first.cost
      proposed = parseMisfits(first.parsed, shownSections)
      // Only proposals get a second look; it can keep a tweet, never add one.
      review = { bySection: proposed.bySection, rescued: [] }
      if (proposed.bySection.some((misfits) => misfits.length)) {
        const second = await retry(
          'review',
          () =>
            requestVerdicts(
              misfitReviewPrompt(
                Number(job.year),
                shownSections,
                proposed.bySection,
              ),
            ),
          3,
        )
        yearCost += second.cost
        review = parseMisfitReview(second.parsed, proposed.bySection)
      }
    } catch (error) {
      audit.push({ ...row, status: 'failed', error: (error as Error).message })
      log(
        `[${++done}/${jobs.length}] @${job.username} ${job.year}: ${(error as Error).message}`,
      )
      return
    }
    cost += yearCost
    const { rejected, judged } = proposed
    const { bySection, rescued } = review
    const shown = candidates.reduce(
      (sum, { section }) => sum + section.tweets.length,
      0,
    )
    let changed = false
    candidates.forEach(({ index }, position) => {
      const section = entry.sections[index]!
      const decision = pruneSection(section.tweetIds, bySection[position]!)
      const sectionAudit = sectionAudits[index]!
      const kept = new Set(proposed.bySection[position]!.map(({ id }) => id))
      sectionAudit.rescued = rescued
        .filter(({ id }) => kept.has(id))
        .map((misfit) => ({ ...misfit, text: snippet(texts.get(misfit.id)) }))
      if (decision.kind === 'unchanged') return
      sectionAudit.decision = decision.kind
      sectionAudit.removed = decision.removed.map((misfit) => ({
        ...misfit,
        text: snippet(texts.get(misfit.id)),
      }))
      if (decision.kind === 'flagged') {
        sectionAudit.why = decision.why
        return
      }
      const removed = new Set(decision.removed.map((misfit) => misfit.id))
      sectionAudit.kept = sectionAudit.kept.filter(({ id }) => !removed.has(id))
      section.tweetIds = decision.tweetIds
      changed = true
    })
    if (!DRY_RUN) {
      // Rebuilt so the stamp sits beside the year's other metadata.
      const { sections, ...rest } = entry
      file.accounts[job.accountId]!.years[job.year] = {
        ...rest,
        misfitsPrunedAt: new Date().toISOString(),
        sections,
      }
      writes = writes.then(write)
      await writes
    }
    audit.push({
      ...row,
      status: changed ? 'pruned' : 'checked',
      cost: yearCost,
      judged: `${judged}/${shown}`,
      rejected,
      sections: sectionAudits,
    })
    log(
      `[${++done}/${jobs.length}] @${job.username} ${job.year}: ${sectionAudits
        .map(
          (section) =>
            `${section.label} ${section.decision === 'pruned' ? `-${section.removed.length}` : section.decision === 'flagged' ? `FLAG(${section.removed.length})` : section.decision === 'skipped' ? 'skip' : '='}${section.rescued?.length ? ` (kept ${section.rescued.length})` : ''}`,
        )
        .join(
          ', ',
        )}${rejected.length ? ` (${rejected.length} rejected)` : ''}${judged < shown ? ` (judged ${judged}/${shown})` : ''}`,
    )
  })
  await writes

  audit.sort((a, b) => a.username.localeCompare(b.username) || b.year - a.year)
  const sections = audit.flatMap((row) => row.sections ?? [])
  const summary = {
    dryRun: DRY_RUN,
    yearsChecked: audit.filter((row) =>
      ['pruned', 'checked'].includes(row.status),
    ).length,
    yearsPruned: audit.filter((row) => row.status === 'pruned').length,
    yearsSkipped: audit.filter((row) => row.status.startsWith('skipped'))
      .length,
    yearsFailed: audit.filter((row) => row.status === 'failed').length,
    sectionsChecked: sections.filter(
      (section) => section.decision !== 'skipped',
    ).length,
    sectionsPruned: sections.filter((section) => section.decision === 'pruned')
      .length,
    sectionsFlagged: sections.filter(
      (section) => section.decision === 'flagged',
    ).length,
    sectionsSkipped: sections.filter(
      (section) => section.decision === 'skipped',
    ).length,
    tweetsMoved: sections
      .filter((section) => section.decision === 'pruned')
      .reduce((sum, section) => sum + section.removed.length, 0),
    tweetsHeldByFlags: sections
      .filter((section) => section.decision === 'flagged')
      .reduce((sum, section) => sum + section.removed.length, 0),
    tweetsKeptByReview: sections.reduce(
      (sum, section) => sum + (section.rescued?.length ?? 0),
      0,
    ),
    rejectedIds: audit.reduce(
      (sum, row) => sum + (row.rejected?.length ?? 0),
      0,
    ),
    costUsd: Number(cost.toFixed(4)),
  }
  await fs.writeFile(
    AUDIT,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: MODEL,
        summary,
        years: audit,
      },
      null,
      2,
    )}\n`,
  )
  log(summary)
  log(`wrote ${AUDIT}`)
  if (summary.yearsFailed) process.exitCode = 1
}

main().catch((error) => {
  log(error)
  process.exit(1)
})
