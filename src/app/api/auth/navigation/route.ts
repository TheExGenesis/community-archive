import {
  agentSearchEnabled,
  agentSearchLaunched,
} from '@/lib/agentSearch/enabled'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { NextResponse } from 'next/server'
import { isAdminUser } from '@/app/admin/data'
import { getCurrentUser, getIsMember } from '@/lib/portal/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const localPreview = await getLocalAdminPreview()
  const [user, isMember] = await Promise.all([getCurrentUser(), getIsMember()])
  const isAdmin = user ? isAdminUser(user) : false
  // Before launch (AGENT_SEARCH_LAUNCHED) only admins see Ask the archive.
  const askVisible = agentSearchLaunched() || isAdmin

  return NextResponse.json(
    {
      isMember: isMember || localPreview === 'admin',
      // Ask the archive's entry points hide while it is paused or unlaunched.
      askEnabled: askVisible && agentSearchEnabled(),
      askVisible,
      localPreview,
      isAdmin,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    },
  )
}
