import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { fetchClickHouseProfileOutreach } from '@/lib/metaTwitter/clickhouseSidebar'
import { createServerClient } from '@/utils/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACCOUNT_ID_PATTERN = /^\d{1,20}$/
const privateHeaders = { 'Cache-Control': 'private, no-store' }

export async function GET(
  _request: NextRequest,
  { params }: { params: { account_id: string } },
) {
  if (!ACCOUNT_ID_PATTERN.test(params.account_id)) {
    return NextResponse.json(
      { error: 'Invalid profile account' },
      { status: 400, headers: privateHeaders },
    )
  }

  const supabase = createServerClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const ownedAccountId = user?.app_metadata?.provider_id
  if (typeof ownedAccountId !== 'string') {
    return NextResponse.json(
      { error: 'Sign in with X to view outreach suggestions' },
      { status: 401, headers: privateHeaders },
    )
  }
  if (ownedAccountId !== params.account_id) {
    return NextResponse.json(
      { error: 'You can only view your own outreach suggestions' },
      { status: 403, headers: privateHeaders },
    )
  }

  try {
    return NextResponse.json(
      await fetchClickHouseProfileOutreach(params.account_id),
      { headers: privateHeaders },
    )
  } catch (error) {
    console.error('Profile outreach request failed:', error)
    return NextResponse.json(
      { error: 'Outreach suggestions are temporarily unavailable' },
      { status: 502, headers: privateHeaders },
    )
  }
}
