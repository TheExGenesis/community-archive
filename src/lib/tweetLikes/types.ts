/** Contracts shared by the tweet-like API routes and the client store. */
export interface TweetLikeSummary {
  count: number
  liked: boolean
}

export interface TweetLikeSummaryResponse {
  signedIn: boolean
  likes: Record<string, TweetLikeSummary>
}

export interface TweetLiker {
  accountId: string
  username: string | null
  displayName: string | null
  likedAt: string
}

export interface TweetLikersResponse {
  count: number
  likers: TweetLiker[]
}
