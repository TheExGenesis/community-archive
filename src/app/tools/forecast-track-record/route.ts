import { notFound, redirect } from 'next/navigation'
import { isAdminUser } from '@/app/admin/data'
import { getCurrentUser } from '@/lib/portal/auth'
import { createServerServiceRoleClient } from '@/utils/supabase'
import {
  assembleReportData,
  renderReport,
  type StoredRun,
} from '@/lib/forecastTrackRecord/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
}

const EMPTY_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Forecast track record</title>
<style>body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:640px;margin:48px auto;padding:0 16px;color:#1d1d1b;background:#fbfaf7}
@media (prefers-color-scheme: dark){body{color:#ecebe6;background:#151514}}code{font-size:13px}</style></head>
<body><h1>Forecast track record</h1>
<p>No run has been uploaded yet. Run the control-panel pipeline in
<code>scripts/reference/track_record/</code>, then upload its
<code>report.html</code> with <code>scripts/upload-forecast-track-record.mts</code>.</p>
<p><a href="/tools">Back to tools</a></p></body></html>`

/**
 * Admin-only: the forecast track record grades named members, which nobody
 * has consented to see published. The page is the prototype's report,
 * rendered from the stored run; opted-out members were never stored or have
 * been deleted by the opt-out trigger.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?redirect=/tools/forecast-track-record')
  if (!isAdminUser(user)) notFound()

  const supabase = createServerServiceRoleClient()
  const { data, error } = await supabase.rpc('get_forecast_track_record')
  if (error) {
    console.error('[forecast track record] load failed:', error)
    return new Response('The forecast track record could not be loaded.', {
      status: 503,
      headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/plain' },
    })
  }

  const html = data
    ? renderReport(assembleReportData(data as unknown as StoredRun))
    : EMPTY_PAGE
  return new Response(html, {
    headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
  })
}
