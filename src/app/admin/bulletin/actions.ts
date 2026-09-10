'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/app/admin/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import type { PromptSaveResult } from '@/lib/bulletin/types'

export async function savePrompt(form: FormData): Promise<PromptSaveResult> {
  // Read-preview authorization must never grant writes to production.
  if ((await getLocalAdminPreview()) === 'admin')
    return {
      error:
        'Local admin preview is read-only. Sign in as an admin with preview disabled to save.',
    }
  const { user } = await requireAdmin('/admin/bulletin')
  const body = form.get('body')
  const note = form.get('note')
  const expected = form.get('expected_id')
  if (
    typeof body !== 'string' ||
    !body.trim() ||
    Buffer.byteLength(body, 'utf8') > 16000 ||
    typeof note !== 'string' ||
    !note.trim() ||
    note.trim().length > 300 ||
    typeof expected !== 'string' ||
    !/^\d+$/.test(expected) ||
    !Number.isSafeInteger(Number(expected)) ||
    Number(expected) < 1
  )
    return {
      error:
        'Enter a prompt (up to 16 KB) and a change note (up to 300 characters).',
    }
  const { data, error } = await createServerServiceRoleClient().rpc(
    'save_bulletin_prompt',
    {
      expected_id: Number(expected),
      prompt_body: body,
      change_note: note.trim(),
      actor_id: user.id,
    },
  )
  if (error || !data)
    return {
      error:
        error?.code === '40001'
          ? 'Another edit was saved first. Copy your draft, then reload to review the latest version.'
          : 'Prompt could not be saved. Your draft is still here.',
    }
  revalidatePath('/admin/bulletin')
  return { version: data }
}
