import { toJson } from './data'
import { createDigestAdminClient } from './database'
import { snapshotDigestTrends } from './snapshotTrends'
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
  const frozenContent = await snapshotDigestTrends(content)
  if (frozenContent === content) return
  const { error: updateError } = await admin
    .from('digest_editions')
    .update({ content: toJson(frozenContent) })
    .eq('id', editionId)
    .eq('status', 'draft')
  if (updateError) throw updateError
}
