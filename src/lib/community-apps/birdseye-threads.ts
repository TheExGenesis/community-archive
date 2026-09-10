/** Groups only cited posts. Missing parents connect siblings but add no content. */
export function groupBirdseyeSources(
  ids: string[],
  rows: {
    tweet_id: string | null
    reply_to_tweet_id: string | null
    conversation_id: string | null
  }[],
) {
  const parent = new Map<string, string>()
  const root = (id: string): string => {
    let current = id
    const seen: string[] = []
    while (parent.has(current) && parent.get(current) !== current) {
      seen.push(current)
      current = parent.get(current)!
    }
    for (const key of seen) parent.set(key, current)
    return current
  }
  const join = (a: string, b: string) => {
    const left = root(a),
      right = root(b)
    if (left !== right) parent.set(left, right)
  }
  const allowed = new Set(ids)
  for (const row of rows) {
    if (!row.tweet_id || !allowed.has(row.tweet_id)) continue
    if (row.reply_to_tweet_id) join(row.tweet_id, row.reply_to_tweet_id)
    if (row.conversation_id) join(row.tweet_id, row.conversation_id)
  }
  const groups = new Map<string, string[]>()
  for (const id of Array.from(allowed)) {
    const key = root(id)
    groups.set(key, [...(groups.get(key) ?? []), id])
  }
  // Snowflake order puts parents before replies, including across page boundaries.
  return Array.from(groups.values()).flatMap((group) => {
    group.sort((a, b) => a.length - b.length || a.localeCompare(b))
    return group.map((id) => ({ id, threadId: group[0] }))
  })
}

/** Quote references are deliberately not edges: only reply participation counts. */
export function selectBirdseyeSources(
  ids: string[],
  rows: (Parameters<typeof groupBirdseyeSources>[1][number] & {
    username: string | null
  })[],
  username: string,
) {
  const index = groupBirdseyeSources(ids, rows)
  const ownIds = new Set(
    rows
      .filter((row) => row.username?.toLowerCase() === username.toLowerCase())
      .map((row) => row.tweet_id),
  )
  const ownThreads = new Set(
    index.filter(({ id }) => ownIds.has(id)).map(({ threadId }) => threadId),
  )
  return index.filter(({ threadId }) => ownThreads.has(threadId))
}
