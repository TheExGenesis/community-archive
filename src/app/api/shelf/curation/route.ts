import { NextResponse } from 'next/server'
import { canCurateShelf } from '@/lib/shelf/access'
import { setShelfCuration, ShelfCurationError } from '@/lib/shelf/data'
import { ACCOUNT_ID_PATTERN, isWorkKey } from '@/lib/shelf/shape'
import { SHELF_DECISIONS, type ShelfDecision } from '@/lib/shelf/types'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers })

/**
 * Approve, hide, reset (status "pending") or rename shelf items.
 * Body: { account_id, work_keys: string[1..500], status, title? }.
 * A title applies to exactly one work; "" restores the generated label.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const accountId = body?.account_id
  const workKeys: unknown = body?.work_keys
  const status = body?.status
  const title = body?.title
  if (
    typeof accountId !== 'string' ||
    !ACCOUNT_ID_PATTERN.test(accountId) ||
    !Array.isArray(workKeys) ||
    workKeys.length < 1 ||
    workKeys.length > 500 ||
    !workKeys.every(isWorkKey) ||
    !(SHELF_DECISIONS as readonly unknown[]).includes(status) ||
    !(
      title === undefined ||
      title === null ||
      (typeof title === 'string' &&
        title.trim().length <= 200 &&
        workKeys.length === 1)
    )
  )
    return fail('Invalid shelf change', 400)

  try {
    // Re-verify ownership on every write: the signed-in owner by
    // app_metadata.provider_id, or the loopback-only local preview.
    if (!(await canCurateShelf(accountId)))
      return fail('Only the owner can change this shelf.', 403)
    const changed = await setShelfCuration(
      accountId,
      Array.from(new Set(workKeys)),
      status as ShelfDecision,
      typeof title === 'string' ? title.trim() : undefined,
    )
    return NextResponse.json({ ok: true, changed }, { headers })
  } catch (error) {
    if (error instanceof ShelfCurationError && error.kind === 'invalid')
      return fail('Invalid shelf change', 400)
    if (error instanceof ShelfCurationError && error.kind === 'forbidden')
      return fail('Only current members have a shelf.', 403)
    return fail('Could not save. Try again.', 503)
  }
}
