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
import type { AgentSearchRun } from './types'

export interface AgentSearchRunStore {
  create(run: AgentSearchRun): Promise<void>
  update(id: string, patch: Partial<AgentSearchRun>): Promise<void>
  get(id: string): Promise<AgentSearchRun | null>
  countSince(accountId: string, sinceIso: string): Promise<number>
  /** `now` defaults to the current time; budget checks pass their own clock. */
  hasRunning(
    accountId: string,
    staleAfterMs: number,
    now?: Date,
  ): Promise<boolean>
  costSince(sinceIso: string): Promise<number>
  /** The member's runs, newest first, for the history list. */
  listRecent(accountId: string, limit: number): Promise<AgentSearchRun[]>
  /** One conversation's runs, oldest first, for any account. */
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

const isRunning = (
  run: Pick<AgentSearchRun, 'accountId' | 'status' | 'startedAt'>,
  accountId: string,
  cutoffMs: number,
) =>
  run.accountId === accountId &&
  run.status === 'running' &&
  Date.parse(run.startedAt) > cutoffMs

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
        await writeAtomic(id, { ...current, ...patch, id })
      }),
    get: (id) => read(id),
    async countSince(accountId, sinceIso) {
      const since = Date.parse(sinceIso)
      return (await readAll()).filter(
        (run) =>
          run.accountId === accountId && Date.parse(run.startedAt) >= since,
      ).length
    },
    async hasRunning(accountId, staleAfterMs, now = new Date()) {
      const cutoff = now.getTime() - staleAfterMs
      return (await readAll()).some((run) => isRunning(run, accountId, cutoff))
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
    },
  }
}

function toRow(run: AgentSearchRun): RunInsert {
  return {
    id: run.id,
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

function toRowPatch(patch: Partial<AgentSearchRun>): RunUpdate {
  const row: RunUpdate = {}
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
  if (patch.inputTokens !== undefined) row.input_tokens = patch.inputTokens
  if (patch.outputTokens !== undefined) row.output_tokens = patch.outputTokens
  if (patch.costUsd !== undefined) row.cost_usd = patch.costUsd
  if (patch.error !== undefined) row.error = patch.error
  if (patch.conversationId !== undefined)
    row.conversation_id = patch.conversationId
  if (patch.parts !== undefined) row.parts = patch.parts as Json
  return row
}

function fromRow(row: RunRow): AgentSearchRun {
  return {
    id: row.id,
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
const MAX_CONVERSATION_RUNS = 50

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
    async hasRunning(accountId, staleAfterMs, now = new Date()) {
      const cutoff = new Date(now.getTime() - staleAfterMs).toISOString()
      const { count, error } = await table()
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('status', 'running')
        .gt('started_at', cutoff)
      if (error)
        throw new Error(`Agent search run check failed: ${error.message}`)
      return (count ?? 0) > 0
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
        .select(
          'id, account_id, conversation_id, question, status, model, started_at, completed_at, error',
        )
        .eq('account_id', accountId)
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error)
        throw new Error(`Agent search history read failed: ${error.message}`)
      return (data ?? []).map((row) =>
        fromRow({
          ...row,
          answer: null,
          cited_tweet_ids: [],
          invalid_citation_ids: [],
          tool_calls: [],
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0,
          parts: null,
        }),
      )
    },
    async listConversation(conversationId) {
      const { data, error } = await table()
        .select('*')
        .eq('conversation_id', conversationId)
        .order('started_at', { ascending: true })
        .limit(MAX_CONVERSATION_RUNS)
      if (error)
        throw new Error(
          `Agent search conversation read failed: ${error.message}`,
        )
      return (data ?? []).map(fromRow)
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
