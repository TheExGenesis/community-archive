'use client'

import TweetAvatarImage from './TweetAvatarImage'
import { Avatar, AvatarFallback } from './ui/avatar'
import type { PortalTweet } from '@/lib/portal/types'

const HUES = [262, 32, 145, 4, 155, 200, 217, 88, 240, 190, 340, 45, 280, 20]
export const avatarHue = (username: string) => {
  let h = 0
  for (let i = 0; i < username.length; i++) {
    h = (h * 31 + username.charCodeAt(i)) >>> 0
  }
  return HUES[h % HUES.length]
}

export function TweetAvatar({
  tweet,
  size = 34,
}: {
  tweet: Pick<PortalTweet, 'id' | 'username' | 'avatar'>
  size?: number
}) {
  const initials = tweet.username.slice(0, 2).toUpperCase()
  return (
    <Avatar className="flex-shrink-0" style={{ width: size, height: size }}>
      <TweetAvatarImage
        src={tweet.avatar}
        alt=""
        username={tweet.username}
        tweetId={tweet.id}
      />
      <AvatarFallback
        className="text-[12px] font-extrabold text-white"
        style={{ background: `hsl(${avatarHue(tweet.username)},42%,42%)` }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
