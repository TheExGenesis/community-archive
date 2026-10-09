// Runs the agentic-search agent in-process over the question set and scores
// each answer against its key. See README.md in this directory.
//
//   node_modules/.bin/tsx --tsconfig scripts/agent-search/tsconfig.json \
//     scripts/agent-search/eval.ts --only recall-future-historians
//
// Flags: --only id,id  --class name[,name]  --limit N  --model provider:model
//        --concurrency N  --timeout-ms N  --questions path  --dry-run
//        --no-validate-keys  --allow-remote-gateway

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import type { LanguageModelUsage, ToolSet } from 'ai'

const HERE = dirname(new URL(import.meta.url).pathname)
const REPO = resolve(HERE, '../..')

type QuestionClass =
  | 'recall-a-tweet'
  | 'survey'
  | 'investigative'
  | 'person-centric'
  | 'time-bounded'
  | 'ambiguous-term'

interface Question {
  id: string
  class: QuestionClass
  question: string
  keyType: 'exact' | 'partial' | 'judged'
  tweetIds: string[]
  sql?: string
  poolSql?: string
  capped?: boolean
  expect?: 'clarify' | 'resolve'
  notes: string
}

interface ToolCallRecord {
  name: string
  input: unknown
  ms: number | null
  tweetIds: number
  counts: Record<string, number>
  error: string | null
}

interface QuestionResult {
  id: string
  class: QuestionClass
  question: string
  keyType: Question['keyType']
  expect?: Question['expect']
  keySize: number
  keyDropped: string[]
  answer: string
  finishReason: string | null
  steps: number
  citedIds: string[]
  invalidCitationIds: string[]
  seenTweetIds: number
  toolCalls: ToolCallRecord[]
  inputTokens: number
  outputTokens: number
  plannerCostUsd: number
  classifierCostUsd: number
  wallMs: number
  error: string | null
  score: Score
}

interface Score {
  /** Share of key ids the answer cited. */
  recallCited: number | null
  /** Share of key ids that appeared in any tool result. */
  recallFound: number | null
  /** Share of cited ids inside the key; exact keys only. */
  precisionCited: number | null
  citedInKey: number
  citedOutsideKey: number
  /** Invalid citations / all citation markers. */
  invalidRate: number | null
  /** recall-a-tweet: 1-based index of the first tool call that returned the id. */
  firstFoundAtCall: number | null
  /** ambiguous-term: rough signal only; judge by reading the answer. */
  askedClarifyingQuestion: boolean | null
}

// ---------- arguments and environment ----------

function parseArgs(argv: string[]) {
  const args = {
    only: [] as string[],
    classes: [] as string[],
    limit: Infinity,
    model: null as string | null,
    concurrency: 1,
    timeoutMs: 300_000,
    questions: join(HERE, 'questions.json'),
    dryRun: false,
    validateKeys: true,
    allowRemoteGateway: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = () => {
      const next = argv[++i]
      if (next === undefined) throw new Error(`${flag} needs a value`)
      return next
    }
    if (flag === '--only') args.only = value().split(',').filter(Boolean)
    else if (flag === '--class')
      args.classes = value().split(',').filter(Boolean)
    else if (flag === '--limit') args.limit = Number(value())
    else if (flag === '--model') args.model = value()
    else if (flag === '--concurrency')
      args.concurrency = Math.max(1, Number(value()))
    else if (flag === '--timeout-ms') args.timeoutMs = Number(value())
    else if (flag === '--questions') args.questions = resolve(value())
    else if (flag === '--dry-run') args.dryRun = true
    else if (flag === '--no-validate-keys') args.validateKeys = false
    else if (flag === '--allow-remote-gateway') args.allowRemoteGateway = true
    else throw new Error(`Unknown flag: ${flag}`)
  }
  return args
}

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!existsSync(path)) return out
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    out[match[1]] = value
  }
  return out
}

// The gateway env comes from the local stand-in file. From .env.local only the
// model key is taken, so production gateway or Supabase settings there can
// never leak into an eval run. Values already in the environment win.
function loadEnv() {
  const gatewayEnv = parseEnvFile(
    process.env.AGENT_SEARCH_GATEWAY_ENV ??
      join(homedir(), 'ca-local/gateway/site.env'),
  )
  const local = parseEnvFile(join(REPO, '.env.local'))
  const picked: Record<string, string> = { ...gatewayEnv }
  if (local.OPENAI_API_KEY) picked.OPENAI_API_KEY = local.OPENAI_API_KEY
  for (const [key, value] of Object.entries(picked)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function assertLocalGateway(allowRemote: boolean) {
  const urls = [
    process.env.CLICKHOUSE_SEARCH_API_URL,
    process.env.CLICKHOUSE_ANALYTICS_API_URL,
  ]
  if (urls.some((url) => !url)) {
    throw new Error(
      'Gateway env missing: expected CLICKHOUSE_SEARCH_API_URL and CLICKHOUSE_ANALYTICS_API_URL (see ~/ca-local/gateway/site.env)',
    )
  }
  const remote = urls.filter(
    (url) => !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url!),
  )
  if (remote.length && !allowRemote) {
    throw new Error(
      `Refusing to run against a non-local gateway (${remote.join(', ')}); pass --allow-remote-gateway`,
    )
  }
}

// ---------- helpers ----------

function loadQuestions(path: string): Question[] {
  const doc = JSON.parse(readFileSync(path, 'utf8')) as {
    questions: Question[]
  }
  return doc.questions
}

function selectQuestions(all: Question[], args: ReturnType<typeof parseArgs>) {
  let selected = all
  if (args.only.length) {
    const unknown = args.only.filter((id) => !all.some((q) => q.id === id))
    if (unknown.length)
      throw new Error(`Unknown question ids: ${unknown.join(', ')}`)
    selected = selected.filter((q) => args.only.includes(q.id))
  }
  if (args.classes.length) {
    selected = selected.filter((q) => args.classes.includes(q.class))
  }
  return selected.slice(0, args.limit)
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : JSON.stringify(error)
}

/** Top-level numbers and array lengths of a tool output, for the report. */
function outputCounts(output: unknown): Record<string, number> {
  const counts: Record<string, number> = {}
  if (!output || typeof output !== 'object') return counts
  for (const [key, value] of Object.entries(
    output as Record<string, unknown>,
  )) {
    if (typeof value === 'number') counts[key] = value
    else if (Array.isArray(value)) counts[key] = value.length
  }
  return counts
}

const ratio = (num: number, den: number) => (den === 0 ? null : num / den)

function quantile(values: number[], q: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}

const mean = (values: Array<number | null>) => {
  const xs = values.filter((v): v is number => v !== null)
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

const pct = (value: number | null) =>
  value === null ? '–' : `${Math.round(value * 100)}%`

// ---------- one question ----------

type Modules = {
  agent: typeof import('@/lib/agentSearch/agent')
  citations: typeof import('@/lib/agentSearch/citations')
  model: typeof import('@/lib/agentSearch/model')
  gateway: typeof import('@/lib/agentSearch/gateway')
  classifier: typeof import('@/lib/agentSearch/classifier')
  ai: typeof import('ai')
}

/** Planner cost at list or env prices; NaN for a model with no price. */
function plannerCost(
  mods: Modules,
  modelSpec: string,
  usage: Partial<LanguageModelUsage>,
): number {
  try {
    return mods.model.estimateModelCostUsd(
      modelSpec,
      {
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens,
        outputTokens: usage.outputTokens,
      },
      mods.model.plannerPriceEnv(),
    )
  } catch {
    return Number.NaN
  }
}

async function validateKey(
  mods: Modules,
  question: Question,
  enabled: boolean,
): Promise<{ key: string[]; dropped: string[] }> {
  if (!enabled || question.tweetIds.length === 0) {
    return { key: question.tweetIds, dropped: [] }
  }
  // Re-check against the gateway so ids hidden by an opt-out leave the key.
  const present = new Set<string>()
  for (let i = 0; i < question.tweetIds.length; i += 100) {
    const tweets = await mods.gateway.getTweetsByIds(
      question.tweetIds.slice(i, i + 100),
    )
    tweets.forEach((tweet) => present.add(tweet.id))
  }
  return {
    key: question.tweetIds.filter((id) => present.has(id)),
    dropped: question.tweetIds.filter((id) => !present.has(id)),
  }
}

function score(
  question: Question,
  key: string[],
  cited: string[],
  invalid: string[],
  outputsByCall: unknown[][],
  seen: Set<string>,
  answer: string,
  collectIds: Modules['citations']['collectToolTweetIds'],
): Score {
  const keySet = new Set(key)
  const citedInKey = cited.filter((id) => keySet.has(id)).length
  const foundInKey = key.filter((id) => seen.has(id)).length
  let firstFoundAtCall: number | null = null
  if (question.class === 'recall-a-tweet' && key.length) {
    const index = outputsByCall.findIndex((outputs) =>
      collectIds(outputs).has(key[0]),
    )
    firstFoundAtCall = index === -1 ? null : index + 1
  }
  // A question to the member usually ends the answer; this is a rough flag.
  const tail =
    answer
      .trim()
      .split(/\n\s*\n/)
      .pop() ?? ''
  return {
    recallCited: ratio(citedInKey, key.length),
    recallFound: ratio(foundInKey, key.length),
    precisionCited:
      question.keyType === 'exact' ? ratio(citedInKey, cited.length) : null,
    citedInKey,
    citedOutsideKey: cited.length - citedInKey,
    invalidRate: ratio(invalid.length, cited.length + invalid.length),
    firstFoundAtCall,
    askedClarifyingQuestion:
      question.class === 'ambiguous-term' ? /\?\s*$/.test(tail) : null,
  }
}

async function runQuestion(
  mods: Modules,
  question: Question,
  modelSpec: string,
  args: ReturnType<typeof parseArgs>,
): Promise<QuestionResult> {
  const started = Date.now()
  const base = {
    id: question.id,
    class: question.class,
    question: question.question,
    keyType: question.keyType,
    ...(question.expect ? { expect: question.expect } : {}),
  }
  let key = question.tweetIds
  let keyDropped: string[] = []
  const toolCalls: ToolCallRecord[] = []
  const outputsByCall: unknown[][] = []
  let answer = ''
  let finishReason: string | null = null
  let steps = 0
  let usage: Partial<LanguageModelUsage> = {}
  let error: string | null = null
  const toolErrors: unknown[] = []

  try {
    ;({ key, dropped: keyDropped } = await validateKey(
      mods,
      question,
      args.validateKeys,
    ))
  } catch (cause) {
    error = `key validation failed: ${errorMessage(cause)}`
  }

  if (!error) {
    try {
      const tools: ToolSet = mods.agent.createAgentSearchTools({ steps: false })
      const agent = new mods.ai.ToolLoopAgent({
        model: mods.model.agentSearchModel(modelSpec),
        instructions: mods.agent.AGENT_SEARCH_INSTRUCTIONS,
        tools,
        stopWhen: mods.ai.isStepCount(mods.agent.AGENT_SEARCH_MAX_STEPS),
        prepareStep: mods.agent.agentSearchPrepareStep(),
      })
      const result = await agent.generate({
        prompt: question.question,
        abortSignal: AbortSignal.timeout(args.timeoutMs),
      })
      answer = mods.agent.finalAnswerText(result.steps)
      finishReason = result.finishReason
      // As in the workflow: a cut-off, filtered or empty answer is an error,
      // not an answer to score.
      error = mods.agent.agentRunFailure(result)
      steps = result.steps.length
      usage = result.usage
      for (const step of result.steps) {
        const toolMs = step.performance?.toolExecutionMs ?? {}
        const settled = new Map<string, { output?: unknown; error?: unknown }>()
        for (const part of step.content) {
          if (part.type === 'tool-result')
            settled.set(part.toolCallId, { output: part.output })
          if (part.type === 'tool-error') {
            settled.set(part.toolCallId, { error: part.error })
            toolErrors.push(part.error)
          }
        }
        for (const call of step.toolCalls) {
          const outcome = settled.get(call.toolCallId) ?? {}
          const outputs = outcome.output === undefined ? [] : [outcome.output]
          outputsByCall.push(outputs)
          toolCalls.push({
            name: call.toolName,
            input: call.input,
            ms: toolMs[call.toolCallId] ?? null,
            tweetIds: mods.citations.collectToolTweetIds(outputs).size,
            counts: outputCounts(outcome.output),
            error:
              outcome.error !== undefined
                ? errorMessage(outcome.error)
                : outcome.output === undefined
                  ? 'no result'
                  : null,
          })
        }
      }
    } catch (cause) {
      error = errorMessage(cause)
    }
  }

  const allOutputs = outputsByCall.flat()
  const seen = mods.citations.collectToolTweetIds(allOutputs)
  const { cited, invalid } = mods.citations.validateCitations(answer, seen)
  // Failed scoring calls carry what they spent on the error (ScoringError).
  const classifierCostUsd = [...allOutputs, ...toolErrors].reduce<number>(
    (sum, value) => {
      const cost = (value as { costUsd?: unknown } | null)?.costUsd
      return sum + (typeof cost === 'number' ? cost : 0)
    },
    0,
  )

  return {
    ...base,
    keySize: key.length,
    keyDropped,
    answer,
    finishReason,
    steps,
    citedIds: cited,
    invalidCitationIds: invalid,
    seenTweetIds: seen.size,
    toolCalls,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    plannerCostUsd: plannerCost(mods, modelSpec, usage),
    classifierCostUsd,
    wallMs: Date.now() - started,
    error,
    score: score(
      question,
      key,
      cited,
      invalid,
      outputsByCall,
      seen,
      answer,
      mods.citations.collectToolTweetIds,
    ),
  }
}

// ---------- report ----------

function markdownReport(
  meta: Record<string, unknown>,
  results: QuestionResult[],
) {
  const lines: string[] = []
  lines.push(`# Agent search eval ${meta.startedAt}`, '')
  lines.push(
    `Model \`${meta.model}\`, scorer \`${meta.scorerModel}\`, ${results.length} questions, ` +
      `questions file \`${meta.questions}\`.`,
    '',
  )
  lines.push(
    '| id | class | key | n | cited | in key | recall cited | recall found | precision | invalid | calls | in tok | out tok | s | error |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  )
  for (const r of results) {
    const s = r.score
    const extra =
      r.class === 'recall-a-tweet' && s.firstFoundAtCall
        ? ` (call ${s.firstFoundAtCall})`
        : r.class === 'ambiguous-term'
          ? ` expect ${r.expect}, asked ${s.askedClarifyingQuestion ? 'yes' : 'no'}`
          : ''
    lines.push(
      `| ${r.id} | ${r.class} | ${r.keyType} | ${r.keySize} | ${r.citedIds.length} | ${s.citedInKey} | ` +
        `${pct(s.recallCited)} | ${pct(s.recallFound)}${extra} | ${pct(s.precisionCited)} | ` +
        `${r.invalidCitationIds.length} | ${r.toolCalls.length} | ${r.inputTokens} | ${r.outputTokens} | ` +
        `${(r.wallMs / 1000).toFixed(1)} | ${r.error ? r.error.replace(/\|/g, '/').slice(0, 80) : ''} |`,
    )
  }
  lines.push('', '## By class', '')
  lines.push(
    '| class | n | mean recall cited | mean recall found | mean precision | invalid rate | p50 s | errors |',
    '|---|---|---|---|---|---|---|---|',
  )
  const classes = Array.from(new Set(results.map((r) => r.class)))
  for (const cls of classes) {
    const rs = results.filter((r) => r.class === cls)
    const invalid = rs.reduce((n, r) => n + r.invalidCitationIds.length, 0)
    const markers = rs.reduce(
      (n, r) => n + r.invalidCitationIds.length + r.citedIds.length,
      0,
    )
    lines.push(
      `| ${cls} | ${rs.length} | ${pct(mean(rs.map((r) => r.score.recallCited)))} | ` +
        `${pct(mean(rs.map((r) => r.score.recallFound)))} | ${pct(mean(rs.map((r) => r.score.precisionCited)))} | ` +
        `${pct(ratio(invalid, markers))} | ${(
          (quantile(
            rs.map((r) => r.wallMs),
            0.5,
          ) ?? 0) / 1000
        ).toFixed(1)} | ` +
        `${rs.filter((r) => r.error).length} |`,
    )
  }
  const wall = results.map((r) => r.wallMs)
  lines.push(
    '',
    '## Totals',
    '',
    `- Input tokens ${results.reduce((n, r) => n + r.inputTokens, 0)}, output tokens ${results.reduce((n, r) => n + r.outputTokens, 0)}`,
    `- Planner cost $${results.reduce((n, r) => n + r.plannerCostUsd, 0).toFixed(4)}, scorer cost $${results.reduce((n, r) => n + r.classifierCostUsd, 0).toFixed(4)} (list prices, src/lib/agentSearch/model.ts)`,
    `- Wall time p50 ${((quantile(wall, 0.5) ?? 0) / 1000).toFixed(1)}s, p95 ${((quantile(wall, 0.95) ?? 0) / 1000).toFixed(1)}s`,
    `- Tool calls ${results.reduce((n, r) => n + r.toolCalls.length, 0)}, errors ${results.filter((r) => r.error).length}`,
    `- Key ids dropped by gateway re-validation: ${results.reduce((n, r) => n + r.keyDropped.length, 0)}`,
    '',
    'Partial keys: recall is against a hand-picked subset, and cited ids outside the key are unjudged, not wrong. ' +
      'Ambiguous-term rows need a human read of the answer; the "asked" flag only checks for a trailing question.',
    '',
  )
  return lines.join('\n')
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  loadEnv()
  assertLocalGateway(args.allowRemoteGateway)

  const questions = selectQuestions(loadQuestions(args.questions), args)
  if (!questions.length) throw new Error('No questions selected')

  // Imported after the env is loaded so module-level reads see it.
  const mods: Modules = {
    agent: await import('@/lib/agentSearch/agent'),
    citations: await import('@/lib/agentSearch/citations'),
    model: await import('@/lib/agentSearch/model'),
    gateway: await import('@/lib/agentSearch/gateway'),
    classifier: await import('@/lib/agentSearch/classifier'),
    ai: await import('ai'),
  }

  if (args.dryRun) {
    for (const q of questions) {
      const { key, dropped } = await validateKey(mods, q, args.validateKeys)
      console.log(
        `${q.id.padEnd(36)} ${q.class.padEnd(15)} ${q.keyType.padEnd(8)} key ${key.length}` +
          (dropped.length
            ? ` (dropped ${dropped.length}: ${dropped.join(',')})`
            : ''),
      )
    }
    return
  }

  const modelSpec = args.model ?? mods.model.agentSearchModelSpec()
  if (!process.env.OPENAI_API_KEY && modelSpec.startsWith('openai:')) {
    throw new Error('OPENAI_API_KEY is not set (expected in .env.local)')
  }
  const startedAt = new Date().toISOString()
  const scorer = mods.classifier.agentSearchScorer()
  const meta = {
    startedAt,
    model: modelSpec,
    scorerModel:
      scorer === 'decisions'
        ? `openai:${mods.classifier.DECISIONS_MODEL} (Decisions API)`
        : scorer === 'jev'
          ? mods.classifier.JEV_MODEL
          : mods.model.agentSearchScorerModelSpec(),
    scorer,
    maxSteps: mods.agent.AGENT_SEARCH_MAX_STEPS,
    questions: args.questions,
    gateway: process.env.CLICKHOUSE_ANALYTICS_API_URL,
    filters: { only: args.only, classes: args.classes, limit: args.limit },
  }

  const outDir = join(HERE, 'results')
  mkdirSync(outDir, { recursive: true })
  const stamp = startedAt.replace(/[:.]/g, '-')
  const jsonPath = join(outDir, `${stamp}.json`)
  const mdPath = join(outDir, `${stamp}.md`)

  const results: QuestionResult[] = new Array(questions.length)
  const write = () => {
    const done = results.filter(Boolean)
    writeFileSync(
      jsonPath,
      JSON.stringify({ ...meta, results: done }, null, 2) + '\n',
    )
    writeFileSync(mdPath, markdownReport(meta, done))
  }

  let next = 0
  const worker = async () => {
    while (next < questions.length) {
      const index = next++
      const q = questions[index]
      console.log(`[${index + 1}/${questions.length}] ${q.id}`)
      const result = await runQuestion(mods, q, modelSpec, args)
      results[index] = result
      write()
      const s = result.score
      console.log(
        `  ${result.error ? `ERROR ${result.error}` : 'ok'}: cited ${result.citedIds.length} ` +
          `(${s.citedInKey} in key), recall cited ${pct(s.recallCited)}, found ${pct(s.recallFound)}, ` +
          `invalid ${result.invalidCitationIds.length}, calls ${result.toolCalls.length}, ` +
          `${(result.wallMs / 1000).toFixed(1)}s`,
      )
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(args.concurrency, questions.length) },
      worker,
    ),
  )
  write()
  console.log(`\nWrote ${jsonPath}\nWrote ${mdPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
