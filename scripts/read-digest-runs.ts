// Read-only dump of recent digest_runs rows (GET requests only).
// Usage: pnpm tsx scripts/read-digest-runs.ts [--date YYYY-MM-DD] [--limit N] [--full] [--out file.json]
// --full includes candidates, model_request, raw_response and parsed_output.
import { writeFile } from 'node:fs/promises'
import { config } from 'dotenv'

config()

const SUMMARY_COLUMNS =
  'id,digest_date,status,model,input_tokens,output_tokens,total_tokens,duration_ms,error,created_at,completed_at'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE
  if (!projectUrl || !serviceRole) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE are required',
    )
  }

  const date = arg('--date')
  const limit = Number(arg('--limit') ?? 5)
  const full = process.argv.includes('--full')
  const out = arg('--out')

  const params = new URLSearchParams({
    select: full ? '*' : SUMMARY_COLUMNS,
    order: 'created_at.desc',
    limit: String(limit),
  })
  if (date) params.set('digest_date', `eq.${date}`)

  const response = await fetch(`${projectUrl}/rest/v1/digest_runs?${params}`, {
    method: 'GET',
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
    signal: AbortSignal.timeout(60_000),
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(
      `Supabase request failed (${response.status}): ${body.slice(0, 500)}`,
    )
  }

  const rows = JSON.parse(body)
  if (out) {
    await writeFile(out, JSON.stringify(rows, null, 2))
    console.log(`wrote ${rows.length} rows to ${out}`)
  } else {
    console.log(JSON.stringify(rows, null, 2))
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
