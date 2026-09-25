import { fetchPortalWeeklyTrends } from '@/lib/portal/analytics'
import { toJson } from './data'
import { createDigestAdminClient } from './database'
import { selectDigestTopTerms } from './trends'
import { parseDigestEditionContent } from './types'

/** Save trends on the draft before publication, so web and email read one value. */
export async function freezeDraftDigestTrends(
  admin: ReturnType<typeof createDigestAdminClient>,
  editionId: string,
) {
  const { data: row, error } = await admin
    .from('digest_editions')
    .select('content, digest_date, status')
    .eq('id', editionId)
    .single()
  if (error) throw error
  const content = parseDigestEditionContent(row.content)
  if (!content || row.status !== 'draft')
    throw new Error('Draft digest content is unavailable')
  if (content.trends) return

  // The live Trends endpoint describes the latest complete UTC week only.
  // Older drafts must never receive a snapshot from a different day.
  if (row.digest_date !== new Date().toISOString().slice(0, 10)) return

  let trends
  try {
    trends = selectDigestTopTerms(
      await fetchPortalWeeklyTrends(),
      row.digest_date,
    )
  } catch (error) {
    console.error('Digest trends could not be frozen:', error)
    return
  }
  if (!trends) return
  const { error: updateError } = await admin
    .from('digest_editions')
    .update({ content: toJson({ ...content, trends }) })
    .eq('id', editionId)
    .eq('status', 'draft')
  if (updateError) throw updateError
}
