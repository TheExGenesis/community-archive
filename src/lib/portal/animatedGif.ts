import type { PortalMedia } from './types'

const GIF_THUMBNAIL =
  /^https:\/\/pbs\.twimg\.com\/tweet_video_thumb\/([\w-]+)\.(?:jpg|png)(?:[?:].*)?$/

/**
 * Twitter serves an animated GIF as a silent looping MP4. The archive stores
 * only its still thumbnail, which shares the MP4's media key.
 */
export function animatedGifVideoUrl(media: PortalMedia): string | null {
  if (media.type !== 'animated_gif') return null
  const key = GIF_THUMBNAIL.exec(media.url)?.[1]
  return key ? `https://video.twimg.com/tweet_video/${key}.mp4` : null
}
