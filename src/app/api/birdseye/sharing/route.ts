import { NextRequest, NextResponse } from 'next/server'
import {
  birdseyeIdentity,
  createBirdseyeShare,
  getBirdseyeOwner,
  loadAccessibleBirdseye,
  PRIVATE_HEADERS,
} from '@/lib/community-apps/birdseye-access'
import { createServerServiceRoleClient } from '@/utils/supabase'
export const dynamic = 'force-dynamic'
async function update(request: NextRequest, enabled: boolean) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return NextResponse.json(
      { error: 'Invalid origin' },
      { status: 403, headers: PRIVATE_HEADERS },
    )
  const user = await getBirdseyeOwner()
  if (!user || !birdseyeIdentity(user))
    return NextResponse.json(
      { error: 'Sign in to manage your Birdseye' },
      { status: 401, headers: PRIVATE_HEADERS },
    )
  if (enabled && !(await loadAccessibleBirdseye())?.isOwner)
    return NextResponse.json(
      { error: 'No Birdseye available to share' },
      { status: 404, headers: PRIVATE_HEADERS },
    )
  const share = enabled ? createBirdseyeShare(user) : null
  const { error } =
    await createServerServiceRoleClient().auth.admin.updateUserById(user.id, {
      app_metadata: { birdseye_share: share?.setting ?? null },
    })
  if (error)
    return NextResponse.json(
      { error: 'Unable to update sharing. Please try again.' },
      { status: 503, headers: PRIVATE_HEADERS },
    )
  return NextResponse.json(
    {
      url: share
        ? new URL(`/api/birdseye/share/${share.token}`, request.url).href
        : null,
    },
    { headers: PRIVATE_HEADERS },
  )
}
export const POST = (request: NextRequest) => update(request, true)
export const DELETE = (request: NextRequest) => update(request, false)
