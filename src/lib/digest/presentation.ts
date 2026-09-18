import type { DigestEditionContent } from './types'

export function shouldShowRepresentativeTweet(content: DigestEditionContent) {
  return !content.stories.some((story) =>
    [...story.bangers, ...story.commentary].some(
      (tweet) => tweet.id === content.topBanger.id,
    ),
  )
}
