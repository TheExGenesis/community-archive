import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { NextResponse } from 'next/server'
import { isAdminUser } from '@/app/admin/data'
import { getCurrentUser, getIsMember } from '@/lib/portal/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const localPreview = await getLocalAdminPreview()
  const [user, isMember] = await Promise.all([getCurrentUser(), getIsMember()])

  return NextResponse.json(
    {
      isMember: isMember || localPreview === 'admin',
      localPreview,
      isAdmin: user ? isAdminUser(user) : false,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    },
  )
}
