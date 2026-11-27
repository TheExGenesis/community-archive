/**
 * Upload a forecast track record run for the admin-only page at
 * /tools/forecast-track-record.
 *
 * Reads the report.html written by the control-panel pipeline
 * (scripts/reference/track_record/render_html.py), splits it into aggregates
 * and one row per author, and replaces the stored run. The database keeps
 * only authors who are current, unblocked members; everyone else is dropped
 * at upload, and a later opt-out deletes that member's rows.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... \
 *     pnpm tsx scripts/upload-forecast-track-record.mts RUN/report.html [--dry-run]
 *
 * There is no default target: pass the project explicitly.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '../src/database-types'
import {
  extractReportData,
  splitReportData,
} from '../src/lib/forecastTrackRecord/data'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const file = args.find((arg) => !arg.startsWith('--'))
if (!file) {
  console.error(
    'usage: upload-forecast-track-record.mts REPORT.html [--dry-run]',
  )
  process.exit(2)
}

const run = splitReportData(extractReportData(readFileSync(file, 'utf8')))
const claims = run.authors.reduce((n, a) => n + a.claims.length, 0)
console.log(
  `${file}: as of ${run.asOf ?? 'unknown'}, ${run.authors.length} authors, ${claims} forecasts`,
)
if (!run.asOf) {
  console.error('The report has no as_of date.')
  process.exit(1)
}
if (dryRun) process.exit(0)

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE
if (!url || !key) {
  console.error(
    'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE for the target project.',
  )
  process.exit(2)
}

const supabase = createClient<Database>(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const { data, error } = await supabase.rpc('replace_forecast_track_record', {
  p_as_of: run.asOf,
  p_summary: run.summary as Json,
  p_authors: run.authors as unknown as Json,
})
if (error) {
  console.error('Upload failed:', error.message)
  process.exit(1)
}
console.log(`Stored on ${new URL(url).host}:`, data)
