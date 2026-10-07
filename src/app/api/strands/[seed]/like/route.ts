import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/portal/auth'
import {
  createStrandAdminClient,
  ensureVisibleStrand,
  getStrandLikeCount,
  getStrandLikedByViewer,
} from '@/lib/community-apps/strand-engagement'

export const dynamic = 'force-dynamic'

type Params = { params: { seed: string } }

const headers = { 'Cache-Control': 'private, no-store' }

/** Viewer-specific like state; the button hydrates its signed-in state here. */
export async function GET(_request: Request, { params }: Params) {
  const strand = await ensureVisibleStrand(params.seed)
  if ('error' in strand) return strand.error

  const user = await getCurrentUser()
  const [count, liked] = await Promise.all([
    getStrandLikeCount(params.seed),
    user ? getStrandLikedByViewer(params.seed, user.id) : false,
  ])

  return NextResponse.json(
    { liked, signedIn: Boolean(user), count },
    { headers },
  )
}

export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const strand = await ensureVisibleStrand(params.seed)
  if ('error' in strand) return strand.error

  const { error } = await createStrandAdminClient()
    .from('strand_likes')
    .upsert(
      { strand_id: params.seed, user_id: user.id },
      { onConflict: 'strand_id,user_id', ignoreDuplicates: true },
    )

  if (error) {
    console.error('Strand like insert failed:', error.message)
    return NextResponse.json({ error: 'Like failed' }, { status: 500 })
  }

  return NextResponse.json({
    liked: true,
    count: await getStrandLikeCount(params.seed),
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const strand = await ensureVisibleStrand(params.seed)
  if ('error' in strand) return strand.error

  const { error } = await createStrandAdminClient()
    .from('strand_likes')
    .delete()
    .eq('strand_id', params.seed)
    .eq('user_id', user.id)

  if (error) {
    console.error('Strand like delete failed:', error.message)
    return NextResponse.json({ error: 'Unlike failed' }, { status: 500 })
  }

  return NextResponse.json({
    liked: false,
    count: await getStrandLikeCount(params.seed),
  })
}
