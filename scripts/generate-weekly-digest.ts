/**
 * Local Weekly Digest generator.
 *
 *   pnpm tsx scripts/generate-weekly-digest.ts 2026-10-19 2026-10-26 2026-11-02
 *
 * Reads published daily editions through the public (anon, RLS-filtered)
 * Supabase API, so it never sees drafts and never writes to the database.
 * Weeks are processed in the order given; each week reads the previous two
 * weekly outputs from the output directory for continuity, so pass weeks
 * oldest first. Writes `<week>.json`, `<week>.md` and `<week>.trace.json`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import type { DigestEditionContent } from '../src/lib/digest/types'
import {
  priorWeeksFor,
  weekDates,
  weekStartFor,
  weeklyDigestToMarkdown,
  type WeeklyDigestContent,
  type WeeklySourceEdition,
} from '../src/lib/digest/weekly'
import { generateWeeklyDigest } from '../src/lib/digest/weeklyGeneration'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '..', '.env') })
if (process.env.CA_ROOT_ENV) config({ path: resolve(process.env.CA_ROOT_ENV) })

const OUTPUT_DIR = resolve(
  process.env.WEEKLY_DIGEST_OUTPUT_DIR ?? 'output/weekly-digest',
)

async function loadEditions(weekStart: string): Promise<WeeklySourceEdition[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Supabase public URL/anon key missing')
  const client = createClient(url, anon, { auth: { persistSession: false } })
  const dates = weekDates(weekStart)
  const { data, error } = await client
    .from('digest_editions')
    .select('digest_date, issue_number, content')
    .eq('status', 'published')
    .gte('digest_date', dates[0])
    .lte('digest_date', dates[6])
    .order('digest_date')
  if (error) throw new Error(`Edition read failed: ${error.message}`)
  return (data ?? []).map((row) => ({
    digestDate: row.digest_date as string,
    issueNumber: (row.issue_number as number | null) ?? null,
    content: row.content as unknown as DigestEditionContent,
  }))
}

async function loadPriorWeeks(
  weekStart: string,
): Promise<WeeklyDigestContent[]> {
  const weeks: WeeklyDigestContent[] = []
  for (const offset of [7, 14]) {
    const start = new Date(`${weekStart}T00:00:00Z`)
    start.setUTCDate(start.getUTCDate() - offset)
    const key = start.toISOString().slice(0, 10)
    try {
      weeks.push(
        JSON.parse(await readFile(resolve(OUTPUT_DIR, `${key}.json`), 'utf8')),
      )
    } catch {
      // A missing earlier week simply means less continuity context.
    }
  }
  return priorWeeksFor(weekStart, weeks)
}

async function main() {
  const weeks = process.argv.slice(2)
  if (weeks.length === 0) {
    throw new Error('Usage: generate-weekly-digest.ts <monday> [<monday> ...]')
  }
  await mkdir(OUTPUT_DIR, { recursive: true })
  for (const week of weeks) {
    const weekStart = weekStartFor(week)
    const editions = await loadEditions(weekStart)
    const priorWeeks = await loadPriorWeeks(weekStart)
    console.log(
      `${weekStart}: ${editions.length} daily editions, prior weeks [${priorWeeks
        .map((w) => w.weekStart)
        .join(', ')}]`,
    )
    const started = Date.now()
    const result = await generateWeeklyDigest({
      weekStart,
      editions,
      priorWeeks,
    })
    const usage = result.attempts.map((attempt) => ({
      model: attempt.model,
      inputTokens: attempt.inputTokens,
      outputTokens: attempt.outputTokens,
      outputError: attempt.outputError,
    }))
    await writeFile(
      resolve(OUTPUT_DIR, `${weekStart}.json`),
      JSON.stringify(result.content, null, 2),
    )
    await writeFile(
      resolve(OUTPUT_DIR, `${weekStart}.md`),
      weeklyDigestToMarkdown(result.content),
    )
    await writeFile(
      resolve(OUTPUT_DIR, `${weekStart}.trace.json`),
      JSON.stringify(
        {
          prompt: result.prompt,
          usage,
          durationMs: Date.now() - started,
          rawOutputs: result.attempts.map((attempt) => attempt.output),
        },
        null,
        2,
      ),
    )
    console.log(
      `  ${result.content.stories.length} stories, ${result.attempts.length} attempt(s), ${Math.round((Date.now() - started) / 1000)}s`,
      usage,
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
