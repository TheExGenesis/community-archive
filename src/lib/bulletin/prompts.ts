import 'server-only'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { getAdminClient } from '@/app/admin/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
import bootstrapPrompt from '../../../services/bulletin/default-prompt.json'
import type { PromptDashboard } from './types'

export async function loadPrompts(before?: string): Promise<PromptDashboard> {
  const preview = (await getLocalAdminPreview()) === 'admin'
  const admin = preview
    ? createServerServiceRoleClient()
    : await getAdminClient()
  if (
    before &&
    (!/^\d+$/.test(before) ||
      !Number.isSafeInteger(Number(before)) ||
      Number(before) < 1)
  )
    throw new Error('Invalid prompt cursor')
  const { data, error } = await admin.rpc('get_bulletin_prompts', {
    before_id: before ? Number(before) : undefined,
  })
  if (error || !data) {
    // The explicit local production read preview may precede the migration.
    if (preview && error?.code === 'PGRST202')
      return {
        active: {
          id: 'legacy',
          body: bootstrapPrompt,
          note: 'Original worker prompt',
          created_at: null,
          created_by: null,
        },
        versions: [],
        read_only: true,
        preview_note:
          'Preview of the original prompt. Version storage and the updated worker have not been deployed to this database. You can edit a draft here; saving is unavailable.',
      }
    throw new Error('Prompt history could not be loaded')
  }
  if (!(data as unknown as PromptDashboard).active)
    throw new Error('No active prompt is configured')
  return { ...(data as unknown as PromptDashboard), read_only: preview }
}
