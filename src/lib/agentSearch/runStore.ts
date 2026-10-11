import 'server-only'
import { randomUUID } from 'crypto'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'fs/promises'
import path from 'path'
import type { Database, Json } from '@/database-types'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { startOfUtcDay } from './day'
import type { AgentSearchRun } from './types'

export const MAX_CONVERSATION_RUNS = 50

/** Tokens and spend to add to a run; every field is an increment. */
export interface RunUsageDelta {
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
}

/** Fields only addUsage may change, so a status patch never resets spend. */
type UsageFields = 'inputTokens' | 'outputTokens' | 'costUsd'
export type RunPatch = Partial<Omit<AgentSearchRun, UsageFields | 'id'>>

/** A question asking to start, with the limits it must fit under. */
export interface AdmissionRequest {
  runId: string
  accountId: string
  conversationId: string
  question: string
  model: string
  dailyLimit: number
  globalDailyUsd: number
  /** A running run older than this no longer blocks a new one. */
  staleRunMs: number
  /** The file store's clock; the Supabase store uses the database's. */
  now?: Date
}

export type AdmissionResult =
  | 'ok'
  | 'not_found'
  | 'daily_limit'
  | 'run_in_progress'
  | 'global_budget'

export interface AgentSearchRunStore {
  create(run: AgentSearchRun): Promise<void>
  update(id: string, patch: RunPatch): Promise<void>
  /** Adds to the run's tokens and cost in one atomic write. */
  addUsage(id: string, delta: RunUsageDelta): Promise<void>
  /**
   * Checks the conversation's owner, the member's daily count and running
   * run, and the global daily spend, and on 'ok' inserts the run as running,
   * all as one step: two requests can never both take the last slot.
   */
  admit(request: AdmissionRequest): Promise<AdmissionResult>
  get(id: string): Promise<AgentSearchRun | null>
  countSince(accountId: string, sinceIso: string): Promise<number>
  /** The member's runs still marked running, whatever their age. */
  listRunning(accountId: string): Promise<AgentSearchRun[]>
  costSince(sinceIso: string): Promise<number>
  /** The member's runs, newest first, for the history list. */
  listRecent(accountId: string, limit: number): Promise<AgentSearchRun[]>
  /**
   * One conversation's newest MAX_CONVERSATION_RUNS runs, oldest first, for
   * any account.
   */
  listConversation(conversationId: string): Promise<AgentSearchRun[]>
}

type RunRow = Database['public']['Tables']['agent_search_runs']['Row']
type RunInsert = Database['public']['Tables']['agent_search_runs']['Insert']
type RunUpdate = Database['public']['Tables']['agent_search_runs']['Update']

const DEFAULT_RUN_DIR = path.join(process.cwd(), '.agent-search-runs')

// Workflow run ids are short alphanumeric tokens. Anything else would let a
// caller-supplied id escape the run directory, so refuse it outright.
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/

function assertRunId(id: string) {
  if (!RUN_ID_PATTERN.test(id)) throw new Error('Invalid agent search run id')
}

const usageInt = (value: number | undefined) =>
  Number.isFinite(value) && (value as number) > 0 ? Math.round(value!) : 0
const usageUsd = (value: number | undefined) =>
  Number.isFinite(value) && (value as number) > 0 ? value! : 0
const roundUsd = (value: number) => Math.round(value * 1e6) / 1e6

// Not a valid run id, so it can never collide with a run's own lock.
const ADMISSION_LOCK = ':admission'

/** A new run as admission inserts it. */
export function newRunRecord(
  request: AdmissionRequest,
  startedAt: string,
): AgentSearchRun {
  return {
    id: request.runId,
    workflowRunId: null,
    accountId: request.accountId,
    conversationId: request.conversationId,
    question: request.question,
    status: 'running',
    model: request.model,
    startedAt,
    completedAt: null,
    answer: null,
    citedTweetIds: [],
    invalidCitationIds: [],
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    error: null,
  }
}

/** The admission rules, shared by the file store and its tests. */
export function admissionDecision(
  runs: AgentSearchRun[],
  request: AdmissionRequest,
  now: Date,
): AdmissionResult {
  const since = Date.parse(startOfUtcDay(now))
  const staleCutoff = now.getTime() - request.staleRunMs
  const own = runs.filter((run) => run.accountId === request.accountId)
  if (
    runs.some(
      (run) =>
        run.conversationId === request.conversationId &&
        run.accountId !== request.accountId,
    )
  ) {
    return 'not_found'
  }
  if (own.filter((run) => Date.parse(run.startedAt) >= since).length >=
    request.dailyLimit) {
    return 'daily_limit'
  }
  if (
    own.some(
      (run) =>
        run.status === 'running' && Date.parse(run.startedAt) > staleCutoff,
    )
  ) {
    return 'run_in_progress'
  }
  const spent = runs
    .filter((run) => Date.parse(run.startedAt) >= since)
    .reduce((sum, run) => sum + (Number(run.costUsd) || 0), 0)
  if (spent >= request.globalDailyUsd) return 'global_budget'
  return 'ok'
}

/**
 * One JSON file per run. Used in development and tests so local work never
 * writes production Supabase.
 */
export function createFileRunStore(
  dir: string = DEFAULT_RUN_DIR,
): AgentSearchRunStore {
  // Serialize read-modify-write per run so concurrent patches from one
  // process (stream progress plus completion) do not overwrite each other.
  const queues = new Map<string, Promise<unknown>>()

  const fileFor = (id: string) => {
    assertRunId(id)
    return path.join(dir, `${id}.json`)
  }

  const withLock = <T>(id: string, task: () => Promise<T>): Promise<T> => {
    const previous = queues.get(id) ?? Promise.resolve()
    const next = previous.then(task, task)
    const settled = next.catch(() => undefined)
    queues.set(id, settled)
    void settled.then(() => {
      if (queues.get(id) === settled) queues.delete(id)
    })
    return next
  }

  // Write to a temp file and rename, so readers never see a partial file.
  const writeAtomic = async (id: string, run: AgentSearchRun) => {
    await mkdir(dir, { recursive: true })
    const target = fileFor(id)
    const temp = `${target}.${process.pid}.${randomUUID()}.tmp`
    try {
      await writeFile(temp, JSON.stringify(run, null, 2), 'utf8')
      await rename(temp, target)
    } catch (error) {
      await unlink(temp).catch(() => undefined)
      throw error
    }
  }

  const read = async (id: string): Promise<AgentSearchRun | null> => {
    try {
      return JSON.parse(await readFile(fileFor(id), 'utf8')) as AgentSearchRun
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  const readAll = async (): Promise<AgentSearchRun[]> => {
    let names: string[]
    try {
      names = await readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const runs = await Promise.all(
      names
        .filter((name) => name.endsWith('.json'))
        .map((name) => read(name.slice(0, -'.json'.length)).catch(() => null)),
    )
    return runs.filter((run): run is AgentSearchRun => run !== null)
  }

  return {
    create: (run) =>
      withLock(run.id, async () => {
        if (await read(run.id)) {
          throw new Error(`Agent search run ${run.id} already exists`)
        }
        await writeAtomic(run.id, run)
      }),
    update: (id, patch) =>
      withLock(id, async () => {
        const current = await read(id)
        if (!current) throw new Error(`Agent search run ${id} not found`)
        const {
          inputTokens: _input,
          outputTokens: _output,
          costUsd: _cost,
          ...fields
        } = patch as Partial<AgentSearchRun>
        await writeAtomic(id, { ...current, ...fields, id })
      }),
    addUsage: (id, delta) =>
      withLock(id, async () => {
        const current = await read(id)
        if (!current) throw new Error(`Agent search run ${id} not found`)
        await writeAtomic(id, {
          ...current,
          inputTokens: current.inputTokens + usageInt(delta.inputTokens),
          outputTokens: current.outputTokens + usageInt(delta.outputTokens),
          costUsd: roundUsd(current.costUsd + usageUsd(delta.costUsd)),
        })
      }),
    get: (id) => read(id),
    async countSince(accountId, sinceIso) {
      const since = Date.parse(sinceIso)
      return (await readAll()).filter(
        (run) =>
          run.accountId === accountId && Date.parse(run.startedAt) >= since,
      ).length
    },
    // One admission at a time in this process, like the database function's
    // lock. (The file store serves one local process.)
    admit: (request) =>
      withLock(ADMISSION_LOCK, async () => {
        const now = request.now ?? new Date()
        const decision = admissionDecision(await readAll(), request, now)
        if (decision !== 'ok') return decision
        if (await read(request.runId)) {
          throw new Error(`Agent search run ${request.runId} already exists`)
        }
        await writeAtomic(
          request.runId,
          newRunRecord(request, now.toISOString()),
        )
        return decision
      }),
    async listRunning(accountId) {
      return (await readAll()).filter(
        (run) => run.accountId === accountId && run.status === 'running',
      )
    },
    async costSince(sinceIso) {
      const since = Date.parse(sinceIso)
      return (await readAll())
        .filter((run) => Date.parse(run.startedAt) >= since)
        .reduce((sum, run) => sum + (Number(run.costUsd) || 0), 0)
    },
    async listRecent(accountId, limit) {
      return (await readAll())
        .filter((run) => run.accountId === accountId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, limit)
    },
    async listConversation(conversationId) {
      return (await readAll())
        .filter((run) => run.conversationId === conversationId)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .slice(-MAX_CONVERSATION_RUNS)
    },
  }
}

function toRow(run: AgentSearchRun): RunInsert {
  return {
    id: run.id,
    workflow_run_id: run.workflowRunId ?? null,
    account_id: run.accountId,
    conversation_id: run.conversationId ?? null,
    question: run.question,
    status: run.status,
    model: run.model,
    started_at: run.startedAt,
    completed_at: run.completedAt,
    answer: run.answer,
    cited_tweet_ids: run.citedTweetIds,
    invalid_citation_ids: run.invalidCitationIds,
    tool_calls: run.toolCalls as Json,
    input_tokens: run.inputTokens,
    output_tokens: run.outputTokens,
    cost_usd: run.costUsd,
    error: run.error,
    parts: (run.parts ?? null) as Json,
  }
}

function toRowPatch(patch: RunPatch): RunUpdate {
  const row: RunUpdate = {}
  if (patch.workflowRunId !== undefined)
    row.workflow_run_id = patch.workflowRunId
  if (patch.accountId !== undefined) row.account_id = patch.accountId
  if (patch.question !== undefined) row.question = patch.question
  if (patch.status !== undefined) row.status = patch.status
  if (patch.model !== undefined) row.model = patch.model
  if (patch.startedAt !== undefined) row.started_at = patch.startedAt
  if (patch.completedAt !== undefined) row.completed_at = patch.completedAt
  if (patch.answer !== undefined) row.answer = patch.answer
  if (patch.citedTweetIds !== undefined)
    row.cited_tweet_ids = patch.citedTweetIds
  if (patch.invalidCitationIds !== undefined)
    row.invalid_citation_ids = patch.invalidCitationIds
  if (patch.toolCalls !== undefined) row.tool_calls = patch.toolCalls as Json
  if (patch.error !== undefined) row.error = patch.error
  if (patch.conversationId !== undefined)
    row.conversation_id = patch.conversationId
  if (patch.parts !== undefined) row.parts = patch.parts as Json
  return row
}

function fromRow(row: RunRow): AgentSearchRun {
  return {
    id: row.id,
    workflowRunId: row.workflow_run_id,
    accountId: row.account_id,
    conversationId: row.conversation_id,
    parts: Array.isArray(row.parts) ? (row.parts as unknown[]) : null,
    question: row.question,
    status: row.status as AgentSearchRun['status'],
    model: row.model,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    answer: row.answer,
    citedTweetIds: row.cited_tweet_ids ?? [],
    invalidCitationIds: row.invalid_citation_ids ?? [],
    toolCalls: (Array.isArray(row.tool_calls)
      ? row.tool_calls
      : []) as unknown as AgentSearchRun['toolCalls'],
    inputTokens: row.input_tokens ?? 0,
    outputTokens: row.output_tokens ?? 0,
    // PostgREST may return numeric as a string when it exceeds JS precision.
    costUsd: Number(row.cost_usd) || 0,
    error: row.error,
  }
}

const COST_PAGE_SIZE = 1000

const ADMISSION_RESULTS: AdmissionResult[] = [
  'ok',
  'not_found',
  'daily_limit',
  'run_in_progress',
  'global_budget',
]

// Lists need no answer bodies, message parts or usage.
const SUMMARY_COLUMNS =
  'id, workflow_run_id, account_id, conversation_id, question, status, model, started_at, completed_at, error'

type SummaryRow = Pick<
  RunRow,
  | 'id'
  | 'workflow_run_id'
  | 'account_id'
  | 'conversation_id'
  | 'question'
  | 'status'
  | 'model'
  | 'started_at'
  | 'completed_at'
  | 'error'
>

const withoutBodies = (row: SummaryRow): RunRow => ({
  ...row,
  answer: null,
  cited_tweet_ids: [],
  invalid_citation_ids: [],
  tool_calls: [],
  input_tokens: 0,
  output_tokens: 0,
  cost_usd: 0,
  parts: null,
})

/** Production store on public.agent_search_runs, service role only. */
export function createSupabaseRunStore(
  client: ReturnType<
    typeof createServerServiceRoleClient
  > = createServerServiceRoleClient(),
): AgentSearchRunStore {
  const table = () => client.from('agent_search_runs')

  return {
    async create(run) {
      const { error } = await table().insert(toRow(run))
      if (error)
        throw new Error(`Agent search run insert failed: ${error.message}`)
    },
    async update(id, patch) {
      const row = toRowPatch(patch)
      if (Object.keys(row).length === 0) return
      const { error } = await table().update(row).eq('id', id)
      if (error)
        throw new Error(`Agent search run update failed: ${error.message}`)
    },
    async addUsage(id, delta) {
      const { error } = await client.rpc('agent_search_add_usage', {
        p_run_id: id,
        p_input_tokens: usageInt(delta.inputTokens),
        p_output_tokens: usageInt(delta.outputTokens),
        p_cost_usd: usageUsd(delta.costUsd),
      })
      if (error)
        throw new Error(`Agent search usage update failed: ${error.message}`)
    },
    async get(id) {
      const { data, error } = await table()
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error)
        throw new Error(`Agent search run read failed: ${error.message}`)
      return data ? fromRow(data) : null
    },
    async countSince(accountId, sinceIso) {
      const { count, error } = await table()
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .gte('started_at', sinceIso)
      if (error)
        throw new Error(`Agent search run count failed: ${error.message}`)
      return count ?? 0
    },
    async admit(request) {
      const { data, error } = await client.rpc('agent_search_admit', {
        p_run_id: request.runId,
        p_account_id: request.accountId,
        p_conversation_id: request.conversationId,
        p_question: request.question,
        p_model: request.model,
        p_daily_limit: Math.floor(request.dailyLimit),
        p_global_daily_usd: request.globalDailyUsd,
        p_stale_after_seconds: Math.ceil(request.staleRunMs / 1000),
      })
      if (error)
        throw new Error(`Agent search admission failed: ${error.message}`)
      if (!ADMISSION_RESULTS.includes(data as AdmissionResult)) {
        throw new Error(`Agent search admission returned ${String(data)}`)
      }
      return data as AdmissionResult
    },
    async listRunning(accountId) {
      const { data, error } = await table()
        .select(SUMMARY_COLUMNS)
        .eq('account_id', accountId)
        .eq('status', 'running')
        .order('started_at', { ascending: true })
        .limit(20)
      if (error)
        throw new Error(`Agent search run check failed: ${error.message}`)
      return (data ?? []).map((row) => fromRow(withoutBodies(row)))
    },
    async costSince(sinceIso) {
      // PostgREST caps result sets, so page through with a stable order
      // rather than trusting one response to hold the whole day.
      let total = 0
      for (let offset = 0; ; offset += COST_PAGE_SIZE) {
        const { data, error } = await table()
          .select('id, cost_usd')
          .gte('started_at', sinceIso)
          .order('id', { ascending: true })
          .range(offset, offset + COST_PAGE_SIZE - 1)
        if (error)
          throw new Error(`Agent search cost read failed: ${error.message}`)
        const rows = data ?? []
        for (const row of rows) total += Number(row.cost_usd) || 0
        if (rows.length < COST_PAGE_SIZE) return total
      }
    },
    async listRecent(accountId, limit) {
      // The list needs no answer bodies or message parts.
      const { data, error } = await table()
        .select(SUMMARY_COLUMNS)
        .eq('account_id', accountId)
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error)
        throw new Error(`Agent search history read failed: ${error.message}`)
      return (data ?? []).map((row) => fromRow(withoutBodies(row)))
    },
    async listConversation(conversationId) {
      // The newest runs, so a long conversation keeps its latest turns.
      const { data, error } = await table()
        .select('*')
        .eq('conversation_id', conversationId)
        .order('started_at', { ascending: false })
        .limit(MAX_CONVERSATION_RUNS)
      if (error)
        throw new Error(
          `Agent search conversation read failed: ${error.message}`,
        )
      return (data ?? []).map(fromRow).reverse()
    },
  }
}

let cachedStore: AgentSearchRunStore | null = null

/**
 * File store whenever NODE_ENV is not production or AGENT_SEARCH_RUN_STORE is
 * 'file'. There is deliberately no override the other way: local development
 * must never write production Supabase.
 */
export function getAgentSearchRunStore(): AgentSearchRunStore {
  if (cachedStore) return cachedStore
  const useFile =
    process.env.NODE_ENV !== 'production' ||
    process.env.AGENT_SEARCH_RUN_STORE === 'file'
  cachedStore = useFile ? createFileRunStore() : createSupabaseRunStore()
  return cachedStore
}
