import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import {
  createDigestAdminClient,
  createDigestPublicClient,
} from '@/lib/digest/database'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = { params: { editionId: string } }

async function likeCount(editionId: string) {
  const admin = createDigestAdminClient()
  const { count } = await admin
    .from('digest_edition_likes')
    .select('*', { count: 'exact', head: true })
    .eq('edition_id', editionId)
  return count ?? 0
}

/**
 * Resolves the session user and confirms the edition exists and is published.
 * Returns an error response instead when either check fails.
 */
async function authorize(editionId: string): Promise<
  | { error: NextResponse }
  | {
      user: User
    }
> {
  if (!UUID_PATTERN.test(editionId)) {
    return {
      error: NextResponse.json({ error: 'Edition not found' }, { status: 404 }),
    }
  }

  const supabase = createDigestPublicClient(cookies())
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const admin = createDigestAdminClient()
  const { data: edition, error } = await admin
    .from('digest_editions')
    .select('id,status')
    .eq('id', editionId)
    .maybeSingle()

  if (error) {
    console.error('Digest like edition lookup failed:', error.message)
    return {
      error: NextResponse.json({ error: 'Lookup failed' }, { status: 500 }),
    }
  }
  if (!edition || edition.status !== 'published') {
    return {
      error: NextResponse.json({ error: 'Edition not found' }, { status: 404 }),
    }
  }

  return { user }
}

/**
 * Viewer-specific like state. The digest pages are ISR-cached and shared
 * between sessions, so the button hydrates its signed-in state from here.
 */
export async function GET(_request: Request, { params }: Params) {
  if (!UUID_PATTERN.test(params.editionId)) {
    return NextResponse.json({ error: 'Edition not found' }, { status: 404 })
  }

  const supabase = createDigestPublicClient(cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let liked = false
  if (user) {
    const admin = createDigestAdminClient()
    const { data } = await admin
      .from('digest_edition_likes')
      .select('id')
      .eq('edition_id', params.editionId)
      .eq('user_id', user.id)
      .maybeSingle()
    liked = Boolean(data)
  }

  return NextResponse.json({
    liked,
    signedIn: Boolean(user),
    count: await likeCount(params.editionId),
  })
}

export async function POST(_request: Request, { params }: Params) {
  const result = await authorize(params.editionId)
  if ('error' in result) return result.error

  const admin = createDigestAdminClient()
  const { error } = await admin
    .from('digest_edition_likes')
    .upsert(
      { edition_id: params.editionId, user_id: result.user.id },
      { onConflict: 'edition_id,user_id', ignoreDuplicates: true },
    )

  if (error) {
    console.error('Digest like insert failed:', error.message)
    return NextResponse.json({ error: 'Like failed' }, { status: 500 })
  }

  return NextResponse.json({
    liked: true,
    count: await likeCount(params.editionId),
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  const result = await authorize(params.editionId)
  if ('error' in result) return result.error

  const admin = createDigestAdminClient()
  const { error } = await admin
    .from('digest_edition_likes')
    .delete()
    .eq('edition_id', params.editionId)
    .eq('user_id', result.user.id)

  if (error) {
    console.error('Digest like delete failed:', error.message)
    return NextResponse.json({ error: 'Unlike failed' }, { status: 500 })
  }

  return NextResponse.json({
    liked: false,
    count: await likeCount(params.editionId),
  })
}
