import type { DigestEditionContent } from '@/lib/digest/types'
import {
  renderWeeklyDigestPrompt,
  weekDates,
  weekStartFor,
  WEEKLY_DIGEST_SYSTEM_PROMPT,
  type WeeklyDigestContent,
  type WeeklySourceEdition,
} from '@/lib/digest/weekly'
import {
  generateWeeklyDigest,
  WEEKLY_DIGEST_MODEL,
} from '@/lib/digest/weeklyGeneration'
import { query, SupabaseRest } from './publish'

type JsonObject = Record<string, unknown>

/** Fewer published dailies than this means the week is too thin to summarize. */
export const WEEKLY_MIN_DAILY_EDITIONS = 5

interface DailyRow {
  id: string
  digest_date: string
  issue_number: number | null
  content: DigestEditionContent
}

interface WeeklyRow {
  id: string
  week_start: string
  status: string
  content: WeeklyDigestContent | null
  workflow_run_id: string | null
}

const log = (message: string, metadata: JsonObject = {}) =>
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      service: 'community-archive-weekly-digest',
      message,
      ...metadata,
    }),
  )

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** The Monday of the most recent fully finished Monday–Sunday week. */
export function latestCompletedWeekStart(now = new Date()): string {
  return addDays(weekStartFor(now.toISOString().slice(0, 10)), -7)
}

export const automatedWorkflowId = (weekStart: string) =>
  `systemd:weekly:${weekStart}`

/** Minimal DB surface, so tests can supply an in-memory fake. */
export interface WeeklyDigestDb {
  select<T>(table: string, query: URLSearchParams): Promise<T[]>
  insert<T>(table: string, value: JsonObject): Promise<T[]>
  update<T>(
    table: string,
    query: URLSearchParams,
    value: JsonObject,
  ): Promise<T[]>
}

export async function publishWeeklyDigest(
  options: {
    weekStart?: string
    dryRun?: boolean
    allowMissingDays?: boolean
    workflowRunId?: string
    db?: WeeklyDigestDb
    generate?: typeof generateWeeklyDigest
  } = {},
) {
  const weekStart = weekStartFor(
    options.weekStart ?? latestCompletedWeekStart(),
  )
  const dates = weekDates(weekStart)
  const dryRun = options.dryRun === true
  const db = options.db ?? new SupabaseRest()
  const generate = options.generate ?? generateWeeklyDigest
  const workflowRunId = options.workflowRunId ?? automatedWorkflowId(weekStart)

  if (!dryRun) {
    const [published] = await db.select<WeeklyRow>(
      'digest_weekly_editions',
      query({
        select: 'id,week_start,status,workflow_run_id',
        week_start: `eq.${weekStart}`,
        status: 'eq.published',
        limit: '1',
      }),
    )
    if (published) {
      log('weekly digest already published; skipping', {
        weekStart,
        editionId: published.id,
      })
      return { status: 'already-published' as const, editionId: published.id }
    }
    const [existing] = await db.select<WeeklyRow>(
      'digest_weekly_editions',
      query({
        select: 'id,week_start,status,workflow_run_id',
        workflow_run_id: `eq.${workflowRunId}`,
        limit: '1',
      }),
    )
    if (existing) {
      // A failed or interrupted attempt is kept for inspection; recovery uses
      // a new --workflow-run-id so no model call repeats implicitly.
      throw new Error(
        `Weekly run ${existing.id} (${workflowRunId}) already exists with status ${existing.status}`,
      )
    }
  }

  const dailyRows = await db.select<DailyRow>(
    'digest_editions',
    query({
      select: 'id,digest_date,issue_number,content',
      status: 'eq.published',
      and: `(digest_date.gte.${dates[0]},digest_date.lte.${dates[6]})`,
      order: 'digest_date.asc',
    }),
  )
  const editions: WeeklySourceEdition[] = dailyRows.map((row) => ({
    digestDate: row.digest_date,
    issueNumber: row.issue_number,
    content: row.content,
  }))
  const present = new Set(editions.map(({ digestDate }) => digestDate))
  if (!options.allowMissingDays) {
    if (!present.has(dates[6])) {
      throw new Error(
        `Sunday ${dates[6]} has no published daily digest yet; waiting before weaving week ${weekStart}`,
      )
    }
    if (editions.length < WEEKLY_MIN_DAILY_EDITIONS) {
      throw new Error(
        `Only ${editions.length} published daily digests for week ${weekStart}; need ${WEEKLY_MIN_DAILY_EDITIONS}`,
      )
    }
  }
  if (editions.length === 0) {
    throw new Error(`No published daily digests for week ${weekStart}`)
  }

  const priorRows = await db.select<WeeklyRow>(
    'digest_weekly_editions',
    query({
      select: 'id,week_start,status,content,workflow_run_id',
      status: 'eq.published',
      week_start: `in.(${addDays(weekStart, -7)},${addDays(weekStart, -14)})`,
      order: 'week_start.desc',
    }),
  )
  const priorWeeks = priorRows.flatMap(({ content }) =>
    content ? [content] : [],
  )
  const userPrompt = renderWeeklyDigestPrompt({
    weekStart,
    editions,
    priorWeeks,
  })

  const startedAt = new Date()
  let rowId: string | null = null
  if (!dryRun) {
    const [row] = await db.insert<WeeklyRow>('digest_weekly_editions', {
      week_start: weekStart,
      status: 'running',
      workflow_run_id: workflowRunId,
      source_edition_ids: dailyRows.map(({ id }) => id),
      prior_week_edition_ids: priorRows.map(({ id }) => id),
      model: WEEKLY_DIGEST_MODEL,
      model_request: {
        systemPrompt: WEEKLY_DIGEST_SYSTEM_PROMPT,
        userPrompt,
        model: WEEKLY_DIGEST_MODEL,
      },
      created_by: null,
    })
    rowId = row?.id ?? null
    if (!rowId) throw new Error('Weekly run row was not created')
  }

  log('weekly generation started', {
    weekStart,
    dryRun,
    dailyEditions: editions.length,
    priorWeeks: priorWeeks.map((week) => week.weekStart),
  })

  try {
    const result = await generate({ weekStart, editions, priorWeeks })
    const durationMs = Date.now() - startedAt.getTime()
    const tokens = (key: 'inputTokens' | 'outputTokens') =>
      result.attempts.reduce((sum, attempt) => sum + (attempt[key] ?? 0), 0)

    if (dryRun || !rowId) {
      log('weekly dry-run validated; no database writes made', {
        weekStart,
        attempts: result.attempts.length,
        durationMs,
        storyCount: result.content.stories.length,
      })
      return { status: 'dry-run' as const, content: result.content }
    }

    const publishedAt = new Date().toISOString()
    const [published] = await db.update<WeeklyRow>(
      'digest_weekly_editions',
      query({ id: `eq.${rowId}`, status: 'eq.running' }),
      {
        status: 'published',
        content: result.content,
        raw_response: {
          attempts: result.attempts.map(({ response }) => response),
        },
        model: result.prompt.model,
        input_tokens: tokens('inputTokens'),
        output_tokens: tokens('outputTokens'),
        duration_ms: durationMs,
        error: null,
        published_at: publishedAt,
        updated_at: publishedAt,
      },
    )
    if (!published) throw new Error('Weekly edition could not be published')
    log('weekly digest published', {
      weekStart,
      editionId: published.id,
      attempts: result.attempts.length,
      storyCount: result.content.stories.length,
      durationMs,
    })
    return { status: 'published' as const, editionId: published.id }
  } catch (error) {
    const message = describeError(error)
    if (rowId) {
      await db.update('digest_weekly_editions', query({ id: `eq.${rowId}` }), {
        status: 'failed',
        error: message.slice(0, 4_000),
        duration_ms: Date.now() - startedAt.getTime(),
        updated_at: new Date().toISOString(),
      })
    }
    throw error
  }
}

if (process.argv[1]?.endsWith('/nightly-digest/publishWeekly.ts')) {
  const args = process.argv.slice(2)
  const value = (flag: string) => {
    const index = args.indexOf(flag)
    return index >= 0 ? args[index + 1] : undefined
  }
  const weekStart = value('--week')
  publishWeeklyDigest({
    weekStart,
    dryRun: args.includes('--dry-run'),
    allowMissingDays: args.includes('--allow-missing-days'),
    workflowRunId: value('--workflow-run-id'),
  }).catch((error) => {
    log('weekly publisher failed', {
      weekStart: weekStart ?? null,
      error: describeError(error),
    })
    process.exitCode = 1
  })
}
