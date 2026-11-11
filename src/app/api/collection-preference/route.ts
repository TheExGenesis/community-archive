import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import {
  createServerClient,
  createServerServiceRoleClient,
} from '@/utils/supabase'
import { getAccountIdentity } from '@/lib/twitterIdentity'

export const dynamic = 'force-dynamic'

async function identity() {
  const client = createServerClient(await cookies())
  const {
    data: { user },
    error,
  } = await client.auth.getUser()
  if (error || !user) return null
  const { providerId, username } = getAccountIdentity(user)
  return providerId && /^[1-9][0-9]{0,19}$/.test(providerId)
    ? { accountId: providerId, userId: user.id, username }
    : null
}

export async function GET() {
  if (process.env.NEXT_PUBLIC_ARCHIVE_ONLY_COLLECTION_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Collection settings are not available yet' },
      { status: 503 },
    )
  }
  const owner = await identity()
  if (!owner)
    return NextResponse.json(
      { error: 'Sign in with X to manage collection' },
      { status: 401 },
    )
  const { accountId } = owner
  const admin = createServerServiceRoleClient({ readSource: 'app' })
  const [preference, archives, optIn] = await Promise.all([
    admin
      .from('account_collection_preferences')
      .select('enabled')
      .eq('account_id', accountId)
      .maybeSingle(),
    admin
      .from('archive_upload')
      .select('id')
      .eq('account_id', accountId)
      .limit(1),
    admin
      .from('optin')
      .select('opted_in, explicit_optout')
      .or(
        `twitter_user_id.eq.${accountId},user_id.eq.${owner.userId}${owner.username ? `,username.eq.${owner.username}` : ''}`,
      ),
  ])
  if (preference.error || archives.error || optIn.error) {
    return NextResponse.json(
      { error: 'Could not load collection settings' },
      { status: 503 },
    )
  }
  const hasMembership = Boolean(
    archives.data?.length ||
      optIn.data?.some((row) => row.opted_in && !row.explicit_optout),
  )
  return NextResponse.json(
    {
      accountId,
      enabled: preference.data?.enabled ?? true,
      // New contributors make an affirmative choice; reuploads retain existing behavior.
      uploadEnabled: preference.data?.enabled ?? hasMembership,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_ARCHIVE_ONLY_COLLECTION_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Collection settings are not available yet' },
      { status: 503 },
    )
  }
  const owner = await identity()
  if (!owner)
    return NextResponse.json(
      { error: 'Sign in with X to manage collection' },
      { status: 401 },
    )
  const { accountId } = owner
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (
    !body ||
    typeof body.enabled !== 'boolean' ||
    body.accountId !== accountId
  ) {
    return NextResponse.json(
      { error: 'Invalid preference or account mismatch' },
      { status: 400 },
    )
  }
  const { error } = await createServerServiceRoleClient({ readSource: 'app' })
    .from('account_collection_preferences')
    .upsert({
      account_id: accountId,
      enabled: body.enabled,
      updated_at: new Date().toISOString(),
    })
  if (error)
    return NextResponse.json(
      { error: 'Could not save collection settings' },
      { status: 503 },
    )
  return NextResponse.json({ accountId, enabled: body.enabled })
}
