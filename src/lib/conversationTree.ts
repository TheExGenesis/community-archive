// Pure conversation-tree helpers, free of request and database dependencies
// so the nightly digest publisher can load them outside Next.js.

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
    // True when the quoted tweet isn't in our archive AND syndication didn't find it
    // either — renderer shows a tombstone.
    is_deleted?: boolean
    // True when the quoted tweet content was hydrated from Twitter's public
    // syndication endpoint rather than our DB. Renderer marks it as "not in archive".
    from_external?: boolean
  } | null
  // True when this node was synthesized for a tweet that's missing from our archive
  // AND Twitter syndication also couldn't supply it. Renderer shows a tombstone.
  is_deleted_placeholder?: boolean
  // True when this tweet was hydrated at render time from Twitter's syndication
  // endpoint, not from our DB. Renderer marks it as "not in archive".
  from_external?: boolean
}

export interface ConversationTree {
  // Primary root for backward compat — the first non-placeholder top-level tweet, or any
  // root if no real root survived. Prefer iterating `roots` for rendering.
  root: string
  // All top-level nodes in the tree (one or more). Synthesized placeholders for missing
  // deleted parents appear here too so their orphan replies still render.
  roots: string[]
  tweets: { [tweet_id: string]: ThreadTweet }
  children: { [tweet_id: string]: string[] }
  parents: { [tweet_id: string]: string }
  paths: { [leaf_id: string]: string[] }
}

// Synthesized stand-in for a parent tweet that no longer exists. The renderer detects
// is_deleted_placeholder and shows a muted "[Tweet deleted]" card in its place.
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

/**
 * Build conversation tree structure from tweets
 * Based on the reference implementation in birdseye
 */
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

  // Phase 1: index every real tweet
  for (const tweet of tweets) {
    tree.tweets[tweet.tweet_id] = tweet
    if (!tree.children[tweet.tweet_id]) tree.children[tweet.tweet_id] = []
  }

  // Phase 2: synthesize placeholders for any reply target that didn't survive
  for (const tweet of tweets) {
    const reply_to = tweet.reply_to_tweet_id
    if (reply_to && !tree.tweets[reply_to]) {
      tree.tweets[reply_to] = makeDeletedPlaceholder(reply_to)
      tree.children[reply_to] = []
    }
  }

  // Phase 3: wire parent/child relationships using the (now complete) tweet index
  for (const id of Object.keys(tree.tweets)) {
    const tweet = tree.tweets[id]
    const reply_to = tweet.reply_to_tweet_id
    if (reply_to && tree.tweets[reply_to]) {
      tree.children[reply_to].push(id)
      tree.parents[id] = reply_to
    }
  }

  // Phase 4: collect every top-level node (no parent in the tree). Placeholders without
  // a parent become roots so their orphan-reply descendants are reachable from rendering.
  for (const id of Object.keys(tree.tweets)) {
    if (!tree.parents[id]) tree.roots.push(id)
  }
  // Backward-compat: pick the primary `root`. Prefer real tweets over placeholders.
  const realRoots = tree.roots.filter(
    (id) => !tree.tweets[id].is_deleted_placeholder,
  )
  tree.root = realRoots[0] ?? tree.roots[0] ?? ''

  // Phase 5: build root-to-leaf paths for every root.
  const buildPaths = (currentId: string, path: string[] = []): void => {
    const newPath = [...path, currentId]
    const children = tree.children[currentId] || []
    if (children.length === 0) {
      tree.paths[currentId] = newPath
    } else {
      for (const childId of children) buildPaths(childId, newPath)
    }
  }
  for (const rootId of tree.roots) buildPaths(rootId)

  return tree
}

/**
 * Get the path from root to a specific tweet in the conversation
 */
export const getPathToTweet = (
  tree: ConversationTree,
  tweet_id: string,
): string[] => {
  // If this is a leaf, we have the path
  if (tree.paths[tweet_id]) {
    return tree.paths[tweet_id]
  }

  // Otherwise, build path from root
  const path: string[] = []
  let current = tweet_id

  while (current && current !== tree.root) {
    path.unshift(current)
    current = tree.parents[current]
  }

  if (tree.root) {
    path.unshift(tree.root)
  }

  return path
}
