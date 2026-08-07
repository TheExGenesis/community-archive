import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'
import { searchTweetsAND, searchTweetsOR } from '@/lib/pgSearch'

export const revalidate = 0

const getClient = () => {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const useRemoteDevDb = process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true'
  const url =
    isDevelopment && !useRemoteDevDb
      ? process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL!
      : process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey =
    isDevelopment && !useRemoteDevDb
      ? process.env.NEXT_PUBLIC_LOCAL_ANON_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false },
  })
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!q || q.length > 200) {
    return NextResponse.json({ tweets: [] })
  }

  const supabase = getClient()
  try {
    let results = await searchTweetsAND(supabase, q)
    if (!results || results.length === 0) {
      results = await searchTweetsOR(supabase, q)
    }

    const tweets = (results ?? []).slice(0, 20).map((t: any) => {
      const account = Array.isArray(t.account) ? t.account[0] : t.account
      const profiles = account?.profile
      const profile = Array.isArray(profiles) ? profiles[0] : profiles
      return {
        id: t.tweet_id,
        username: account?.username ?? 'unknown',
        name: account?.account_display_name ?? account?.username ?? 'Unknown',
        avatar: profile?.avatar_media_url ?? null,
        text: t.full_text ?? '',
        createdAt: t.created_at,
        likes: t.favorite_count ?? 0,
        rts: t.retweet_count ?? 0,
      }
    })

    return NextResponse.json(
      { tweets },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    )
  } catch (error) {
    console.error('Portal search failed:', error)
    return NextResponse.json({ tweets: [] }, { status: 500 })
  }
}
