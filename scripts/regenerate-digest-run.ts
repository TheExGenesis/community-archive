/**
 * Regenerate a frozen nightly digest run locally with a prompt migration's
 * sentence replacements applied, without writing anything to Supabase.
 *
 *   pnpm tsx scripts/regenerate-digest-run.ts <run.json> <migration.sql> <out.json>
 *
 * <run.json> is a digest_runs row (or a one-element array of them) with
 * model_request and parsed_output, e.g. a read-only PostgREST export. The
 * migration must declare adjacent $old_*$ / $new_*$ dollar-quoted pairs.
 * Needs OPENROUTER_API_KEY (read from ../.env when present).
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { config } from 'dotenv'
import { renderDigestPrompt } from '../src/lib/digest/generation'
import type { DigestPromptVersion } from '../src/lib/digest/types'
import { generateValidated } from '../services/nightly-digest/publish'

config({ path: resolve(process.cwd(), '..', '.env') })

const replacementPairs = (sql: string) => {
  const pairs: Array<[string, string]> = []
  const pattern =
    /\$old_(\w+)\$([\s\S]*?)\$old_\1\$[\s\S]*?\$new_\1\$([\s\S]*?)\$new_\1\$/g
  for (const match of sql.matchAll(pattern)) pairs.push([match[2], match[3]])
  if (!pairs.length) throw new Error('Migration has no $old_*$/$new_*$ pairs')
  return pairs
}

const applyPairs = (text: string, pairs: Array<[string, string]>) => {
  let next = text
  let applied = 0
  for (const [from, to] of pairs) {
    if (!next.includes(from)) continue
    next = next.replace(from, to)
    applied += 1
  }
  return { next, applied }
}

async function main() {
  const [runPath, migrationPath, outPath] = process.argv.slice(2)
  if (!runPath || !migrationPath || !outPath) {
    throw new Error(
      'Usage: regenerate-digest-run.ts <run.json> <migration.sql> <out.json>',
    )
  }
  const raw = JSON.parse(await readFile(runPath, 'utf8'))
  const run = Array.isArray(raw) ? raw[0] : raw
  const request = run.model_request
  const basePrompt: DigestPromptVersion = request.promptVersion
  const pairs = replacementPairs(await readFile(migrationPath, 'utf8'))
  const system = applyPairs(basePrompt.systemPrompt, pairs)
  const user = applyPairs(basePrompt.userPromptTemplate, pairs)
  if (system.applied + user.applied !== pairs.length) {
    throw new Error(
      `Only ${system.applied + user.applied} of ${pairs.length} replacements matched prompt version ${basePrompt.version}`,
    )
  }
  const prompt: DigestPromptVersion = {
    ...basePrompt,
    systemPrompt: system.next,
    userPromptTemplate: user.next,
  }
  const window = {
    digestDate: run.digest_date as string,
    windowStart: run.window_start as string,
    windowEnd: run.window_end as string,
  }
  const renderedPrompt = renderDigestPrompt(prompt.userPromptTemplate, {
    ...window,
    candidates: request.candidateSnapshot,
    priorDigests: request.continuityContext,
  })
  const result = await generateValidated({
    runId: `local-${run.id}`,
    ...window,
    candidates: request.candidateSnapshot,
    prompt,
    renderedPrompt,
  })
  const before = run.parsed_output
  const summarize = (content: typeof result.content) => ({
    executiveSummary: content.executiveSummary,
    titles: content.stories.map((story) => ({
      title: story.title,
      titleKind: story.titleKind ?? null,
      titleIsQuote: story.titleIsQuote ?? null,
      bangers: story.bangers.map(({ username, text }) => ({
        username,
        text: text.slice(0, 160),
      })),
    })),
    editorialWarnings: content.editorialWarnings,
  })
  await writeFile(
    outPath,
    JSON.stringify(
      {
        runId: run.id,
        digestDate: run.digest_date,
        basePromptVersion: basePrompt.version,
        attempts: result.attempts.length,
        before: summarize(before),
        after: summarize(result.content),
        afterContent: result.content,
      },
      null,
      2,
    ),
  )
  console.log(`Wrote ${outPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
