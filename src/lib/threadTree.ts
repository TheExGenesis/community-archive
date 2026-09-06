export interface ThreadTweet {
  tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  retweet_count: number | null
  favorite_count: number
  reply_to_tweet_id: string | null
  reply_to_user_id: string | null
  reply_to_username: string | null
  username: string
  account_display_name: string
  avatar_media_url?: string
  media?: any[]
  quote_tweet_id?: string | null
  quoted_tweet?: {
    tweet_id: string
    account_id: string
    created_at: string
    full_text: string
    retweet_count: number | null
    favorite_count: number
    avatar_media_url?: string
    username: string
    account_display_name: string
    media?: any[]
    is_deleted?: boolean
    from_external?: boolean
  } | null
  is_deleted_placeholder?: boolean
  from_external?: boolean
}

export interface ConversationTree {
  root: string
  roots: string[]
  tweets: { [tweet_id: string]: ThreadTweet }
  children: { [tweet_id: string]: string[] }
  parents: { [tweet_id: string]: string }
  paths: { [leaf_id: string]: string[] }
}

export const makeDeletedPlaceholder = (tweet_id: string): ThreadTweet => ({
  tweet_id,
  account_id: '',
  created_at: '',
  full_text: '',
  retweet_count: 0,
  favorite_count: 0,
  reply_to_tweet_id: null,
  reply_to_user_id: null,
  reply_to_username: null,
  username: '',
  account_display_name: '',
  is_deleted_placeholder: true,
})

export const buildConversationTree = (
  tweets: ThreadTweet[],
): ConversationTree => {
  const tree: ConversationTree = {
    root: '',
    roots: [],
    tweets: {},
    children: {},
    parents: {},
    paths: {},
  }

  for (const tweet of tweets) {
    tree.tweets[tweet.tweet_id] = tweet
    if (!tree.children[tweet.tweet_id]) tree.children[tweet.tweet_id] = []
  }

  for (const tweet of tweets) {
    const replyTo = tweet.reply_to_tweet_id
    if (replyTo && !tree.tweets[replyTo]) {
      tree.tweets[replyTo] = makeDeletedPlaceholder(replyTo)
      tree.children[replyTo] = []
    }
  }

  for (const id of Object.keys(tree.tweets)) {
    const replyTo = tree.tweets[id].reply_to_tweet_id
    if (replyTo && tree.tweets[replyTo]) {
      tree.children[replyTo].push(id)
      tree.parents[id] = replyTo
    }
  }

  for (const id of Object.keys(tree.tweets)) {
    if (!tree.parents[id]) tree.roots.push(id)
  }
  const realRoots = tree.roots.filter(
    (id) => !tree.tweets[id].is_deleted_placeholder,
  )
  tree.root = realRoots[0] ?? tree.roots[0] ?? ''

  const buildPaths = (currentId: string, path: string[] = []): void => {
    const newPath = [...path, currentId]
    const children = tree.children[currentId] || []
    if (children.length === 0) {
      tree.paths[currentId] = newPath
      return
    }
    for (const childId of children) buildPaths(childId, newPath)
  }
  for (const rootId of tree.roots) buildPaths(rootId)

  return tree
}
