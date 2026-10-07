import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/portal/auth'
import {
  loadTweetLikeCount,
  resolveLiker,
  TWEET_ID_PATTERN,
} from '@/lib/tweetLikes/server'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const runtime = 'nodejs'

type Params = { params: { tweet_id: string } }

async function setLike({ params }: Params, liked: boolean) {
  if (!TWEET_ID_PATTERN.test(params.tweet_id)) {
    return NextResponse.json({ error: 'Tweet not found' }, { status: 404 })
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in before liking a tweet.' },
      { status: 401 },
    )
  }
  const liker = resolveLiker(user)
  if (!liker) {
    return NextResponse.json(
      { error: 'Sign in with X to like tweets.' },
      { status: 403 },
    )
  }

  const admin = createServerServiceRoleClient()
  const { error } = liked
    ? await admin.from('ca_tweet_likes').upsert(
        {
          user_id: user.id,
          account_id: liker.accountId,
          tweet_id: params.tweet_id,
          username: liker.username,
          display_name: liker.displayName,
        },
        { onConflict: 'user_id,tweet_id', ignoreDuplicates: true },
      )
    : await admin
        .from('ca_tweet_likes')
        .delete()
        .eq('tweet_id', params.tweet_id)
        .eq('user_id', user.id)

  if (error) {
    console.error('Tweet like write failed:', error.message)
    return NextResponse.json(
      { error: 'We could not save this like. Please try again.' },
      { status: 500 },
    )
  }

  try {
    return NextResponse.json({
      liked,
      count: await loadTweetLikeCount(params.tweet_id),
    })
  } catch (countError) {
    console.error(countError)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }
}

export async function POST(_request: Request, context: Params) {
  return setLike(context, true)
}

export async function DELETE(_request: Request, context: Params) {
  return setLike(context, false)
}
