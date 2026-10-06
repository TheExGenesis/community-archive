// Dry-run a digest edition from a saved run's candidates with a chosen model.
// Reads prod (digest_runs, digest_prompt_versions, digest_editions) and
// ClickHouse for context; never writes to the database or publishes.
//
//   pnpm tsx scripts/digest-dry-run.ts --date 2026-10-06 \
//     --model moonshotai/kimi-k3 [--exclude id1,id2] [--out dir]
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { generateValidated } from '../services/nightly-digest/publish'
import { getDigestDateWindow } from '@/lib/digest/dateWindow'
import { enrichDigestCandidates } from '@/lib/digest/enrichment'
import {
  renderDigestPrompt,
  type DigestContinuityContext,
} from '@/lib/digest/generation'
import type {
  DigestCandidate,
  DigestEditionContent,
  DigestPromptVersion,
} from '@/lib/digest/types'

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const digestDate = arg('date')
const model = arg('model')
if (!digestDate || !model) throw new Error('--date and --model are required')
const excluded = new Set((arg('exclude') ?? '').split(',').filter(Boolean))
const outDir = resolve(
  arg('out') ??
    `output/digest-dry-runs/${digestDate}/${model.replace('/', '_')}`,
)

const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')}/rest/v1`
const serviceRole = process.env.SUPABASE_SERVICE_ROLE
if (!serviceRole) throw new Error('SUPABASE_SERVICE_ROLE is required')

async function select<T>(table: string, params: Record<string, string>) {
  const response = await fetch(
    `${baseUrl}/${table}?${new URLSearchParams(params)}`,
    {
      headers: { apikey: serviceRole!, Authorization: `Bearer ${serviceRole}` },
    },
  )
  if (!response.ok) {
    throw new Error(`${table} read failed (${response.status})`)
  }
  return (await response.json()) as T[]
}

async function main() {
  const window = getDigestDateWindow(digestDate!)
  const [run] = await select<{
    id: string
    candidates: DigestCandidate[]
    prompt_version_id: string
  }>('digest_runs', {
    select: 'id,candidates,prompt_version_id',
    digest_date: `eq.${digestDate}`,
    order: 'created_at.desc',
    limit: '1',
  })
  if (!run) throw new Error(`No saved run for ${digestDate}`)

  const [promptRow] = await select<Record<string, unknown>>(
    'digest_prompt_versions',
    { select: '*', id: `eq.${run.prompt_version_id}` },
  )
  const parameters = (promptRow.parameters ?? {}) as Record<string, unknown>
  const prompt: DigestPromptVersion = {
    id: String(promptRow.id),
    version: Number(promptRow.version),
    label: String(promptRow.label),
    model,
    systemPrompt: String(promptRow.system_prompt),
    userPromptTemplate: String(promptRow.user_prompt_template),
    parameters: {
      ...(typeof parameters.reasoning_effort === 'string'
        ? { reasoning_effort: parameters.reasoning_effort }
        : {}),
      ...(typeof parameters.max_output_tokens === 'number'
        ? { max_output_tokens: parameters.max_output_tokens }
        : {}),
      ...(typeof parameters.temperature === 'number'
        ? { temperature: parameters.temperature }
        : {}),
    },
    createdBy: null,
    createdAt: String(promptRow.created_at),
  }

  const editions = await select<{
    digest_date: string
    content: DigestEditionContent | null
  }>('digest_editions', {
    select: 'digest_date,content',
    status: 'eq.published',
    digest_date: `lt.${digestDate}`,
    order: 'digest_date.desc,version.desc',
    limit: '7',
  })
  const priorDigests: DigestContinuityContext[] = editions.flatMap(
    ({ digest_date: priorDate, content }) =>
      content
        ? [
            {
              digestDate: priorDate,
              executiveSummary: content.executiveSummary,
              storyTitles: content.stories.map(({ title }) => title),
              keywords: content.keywords,
            },
          ]
        : [],
  )

  const candidates = run.candidates.filter(
    ({ tweet }) => !excluded.has(tweet.id),
  )
  const { enrichedCandidates, failedFetches } = await enrichDigestCandidates(
    candidates,
    window,
  )
  const renderedPrompt = renderDigestPrompt(prompt.userPromptTemplate, {
    ...window,
    candidates: enrichedCandidates,
    priorDigests,
  })
  await mkdir(outDir, { recursive: true })
  await writeFile(resolve(outDir, 'prompt.txt'), renderedPrompt)
  console.log(
    JSON.stringify({
      model,
      sourceRunId: run.id,
      promptVersion: prompt.version,
      candidates: candidates.length,
      excluded: [...excluded],
      commentary: enrichedCandidates.reduce(
        (sum, { commentary }) => sum + commentary.length,
        0,
      ),
      failedFetches,
      promptChars: renderedPrompt.length,
    }),
  )

  const startedAt = Date.now()
  const result = await generateValidated({
    runId: crypto.randomUUID(),
    digestDate: digestDate!,
    ...window,
    candidates: enrichedCandidates,
    prompt,
    renderedPrompt,
  })
  await writeFile(
    resolve(outDir, 'content.json'),
    JSON.stringify(result.content, null, 2),
  )
  await writeFile(
    resolve(outDir, 'attempts.json'),
    JSON.stringify(
      result.attempts.map(({ response, ...rest }) => ({ ...rest, response })),
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      model: result.generated.model,
      attempts: result.attempts.length,
      durationMs: Date.now() - startedAt,
      inputTokens: result.generated.inputTokens,
      outputTokens: result.generated.outputTokens,
      stories: result.content.stories.length,
      outDir,
    }),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
