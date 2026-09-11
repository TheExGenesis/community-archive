import { RefreshControls } from '@/components/bulletin/RefreshControls'
import { loadPrompts } from '@/lib/bulletin/prompts'
import { measureServerRead } from '@/lib/performance/server'

/** Optional admin tools must not hold up the recommended cards. */
export async function BulletinRefreshControls() {
  const prompt = await measureServerRead('bulletin.admin-controls', () =>
    loadPrompts(),
  ).catch(() => null)
  return prompt ? <RefreshControls promptId={prompt.active.id} /> : null
}
