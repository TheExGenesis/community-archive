'use server'

import { requireAdmin } from '@/app/admin/data'
import { requestSocialGraphFullRebuild } from '@/lib/socialGraphAdmin'

export type SocialGraphRebuildActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

export async function requestFullSocialGraphRebuild(): Promise<SocialGraphRebuildActionResult> {
  await requireAdmin()
  try {
    await requestSocialGraphFullRebuild()
    return {
      ok: true,
      message:
        'Full refresh queued. The snapshot timestamp will update after the background build finishes.',
    }
  } catch (error) {
    console.error('[social graph admin] full rebuild request failed:', error)
    return {
      ok: false,
      error:
        'The full refresh could not be queued. Try again or check the gateway service.',
    }
  }
}
