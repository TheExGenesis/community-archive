import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { config } from 'dotenv'
import { Agent, fetch } from 'undici'
import { AUGUST_11_MOCK_DIGEST } from '../src/lib/digest/mock'
import {
  assembleDigestEditionContent,
  renderDigestPrompt,
  type EnrichedDigestCandidate,
} from '../src/lib/digest/generation'
import { DIGEST_JSON_SCHEMA } from '../src/lib/digest/openai'

const MODEL = 'deepseek/deepseek-v4-flash-0731'
const RUNS = 5
const ROOT_ENV = resolve(process.cwd(), '..', '.env')
const PROMPT_MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20260814215420_preserve_community_weighting_with_complete_subtitles.sql',
)
const OUTPUT_PATH = resolve(
  process.cwd(),
  process.argv[2] ??
    'memos/artifacts/20260814-deepseek-v4-flash-digest-eval.json',
)

config({ path: ROOT_ENV })

const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured')

async function main() {
  const migration = await readFile(PROMPT_MIGRATION, 'utf8')
  const systemPrompt = migration.match(
    /\$system_prompt\$([\s\S]*?)\$system_prompt\$/,
  )?.[1]
  const userPromptTemplate = migration.match(
    /\$user_prompt\$([\s\S]*?)\$user_prompt\$/,
  )?.[1]
  if (!systemPrompt || !userPromptTemplate) {
    throw new Error('Could not read the immutable digest prompt migration')
  }

  const seenBangers = new Set<string>()
  let sourceRank = 0
  const candidates: EnrichedDigestCandidate[] =
    AUGUST_11_MOCK_DIGEST.content.stories.flatMap((story) =>
      story.bangers.flatMap((banger, bangerIndex) => {
        if (seenBangers.has(banger.id)) return []
        seenBangers.add(banger.id)
        sourceRank += 1
        const directContext = story.commentary.filter(
          (tweet) => tweet.quotedTweet?.id === banger.id,
        )
        const commentary =
          directContext.length || bangerIndex > 0
            ? directContext
            : story.commentary
        return [
          {
            candidate: {
              tweet: banger,
              sourceRank,
              selected: true,
            },
            commentary,
            replyTweetIds: [],
            totalReplyCount: commentary.length,
          },
        ]
      }),
    )

  const prompt = renderDigestPrompt(userPromptTemplate, {
    digestDate: AUGUST_11_MOCK_DIGEST.digestDate,
    windowStart: AUGUST_11_MOCK_DIGEST.content.windowStart,
    windowEnd: AUGUST_11_MOCK_DIGEST.content.windowEnd,
    candidates,
  })

  type Trial = {
    trial: number
    passed: boolean
    durationMs: number
    responseId: string | null
    model: string | null
    provider: string | null
    inputTokens: number | null
    outputTokens: number | null
    outputHash: string | null
    storyCount: number | null
    representativeTweetId: string | null
    editorialWarningCount: number | null
    editorialWarnings: string[]
    error: string | null
    output: unknown
  }

  const trials: Trial[] = []

  const buildReport = () => ({
    evaluatedAt: new Date().toISOString(),
    model: MODEL,
    corpus: {
      bangers: candidates.length,
      contextPosts: candidates.reduce(
        (sum, candidate) => sum + candidate.commentary.length,
        0,
      ),
      promptCharacters: systemPrompt.length + prompt.length,
    },
    passed: trials.filter((trial) => trial.passed).length,
    total: trials.length,
    trials,
  })

  const saveReport = async () => {
    await mkdir(resolve(OUTPUT_PATH, '..'), { recursive: true })
    await writeFile(
      OUTPUT_PATH,
      `${JSON.stringify(buildReport(), null, 2)}\n`,
      'utf8',
    )
  }

  for (let trial = 1; trial <= RUNS; trial += 1) {
    const startedAt = Date.now()
    let rawOutput: unknown = null
    let responseId: string | null = null
    let resolvedModel: string | null = null
    let provider: string | null = null
    let inputTokens: number | null = null
    let outputTokens: number | null = null
    const dispatcher = new Agent({
      headersTimeout: 180_000,
      bodyTimeout: 180_000,
    })
    try {
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://community-archive.org',
            'X-Title': 'Community Archive Daily Digest Evaluation',
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            reasoning: { effort: 'low', exclude: true },
            provider: { data_collection: 'deny', zdr: true },
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'community_archive_daily_digest',
                strict: true,
                schema: DIGEST_JSON_SCHEMA,
              },
            },
            max_tokens: 6_000,
            temperature: 0.2,
            seed: trial,
          }),
          dispatcher,
        },
      )
      const payload = (await response.json()) as Record<string, unknown>
      if (!response.ok) {
        throw new Error(
          `OpenRouter returned ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`,
        )
      }
      responseId = typeof payload.id === 'string' ? payload.id : null
      resolvedModel = typeof payload.model === 'string' ? payload.model : null
      provider = typeof payload.provider === 'string' ? payload.provider : null
      const usage =
        payload.usage && typeof payload.usage === 'object'
          ? (payload.usage as Record<string, unknown>)
          : {}
      inputTokens =
        typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null
      outputTokens =
        typeof usage.completion_tokens === 'number'
          ? usage.completion_tokens
          : null
      const choice = Array.isArray(payload.choices) ? payload.choices[0] : null
      const message =
        choice && typeof choice === 'object'
          ? (choice as { message?: unknown }).message
          : null
      const content =
        message && typeof message === 'object'
          ? (message as { content?: unknown }).content
          : null
      if (typeof content !== 'string') {
        throw new Error('OpenRouter response did not contain string content')
      }
      rawOutput = JSON.parse(content)
      const edition = assembleDigestEditionContent({
        runId: `benchmark-${trial}`,
        digestDate: AUGUST_11_MOCK_DIGEST.digestDate,
        windowStart: AUGUST_11_MOCK_DIGEST.content.windowStart,
        windowEnd: AUGUST_11_MOCK_DIGEST.content.windowEnd,
        allCandidateCount: candidates.length,
        enrichedCandidates: candidates,
        modelOutput: rawOutput,
        generatedAt: new Date().toISOString(),
      })
      trials.push({
        trial,
        passed: true,
        durationMs: Date.now() - startedAt,
        responseId,
        model: resolvedModel,
        provider,
        inputTokens,
        outputTokens,
        outputHash: createHash('sha256')
          .update(JSON.stringify(rawOutput))
          .digest('hex'),
        storyCount: edition.stories.length,
        representativeTweetId: edition.topBanger.id,
        editorialWarningCount: edition.editorialWarnings?.length ?? 0,
        editorialWarnings: edition.editorialWarnings ?? [],
        error: null,
        output: rawOutput,
      })
    } catch (error) {
      trials.push({
        trial,
        passed: false,
        durationMs: Date.now() - startedAt,
        responseId,
        model: resolvedModel,
        provider,
        inputTokens,
        outputTokens,
        outputHash: rawOutput
          ? createHash('sha256').update(JSON.stringify(rawOutput)).digest('hex')
          : null,
        storyCount: null,
        representativeTweetId: null,
        editorialWarningCount: null,
        editorialWarnings: [],
        error: error instanceof Error ? error.message : String(error),
        output: rawOutput,
      })
    } finally {
      await dispatcher.close()
      await saveReport()
    }
  }

  const report = buildReport()
  process.stdout.write(
    `${JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        model: MODEL,
        corpus: report.corpus,
        passed: report.passed,
        total: report.total,
        trials: trials.map(({ output: _output, ...trial }) => trial),
      },
      null,
      2,
    )}\n`,
  )
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  )
  process.exitCode = 1
})
