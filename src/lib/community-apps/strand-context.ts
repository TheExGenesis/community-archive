import type { ThreadTweet } from '@/lib/threadUtils'
/** Follow actual parent edges, then replies in chronological order.
 * Missing/withdrawn nodes break traversal; never jump over a policy boundary.
 */
export function selectStrandContext(
  nodes: Pick<ThreadTweet, 'tweet_id' | 'reply_to_tweet_id' | 'created_at'>[],
  selectedId: string,
) {
  const byId = new Map(nodes.map((n) => [n.tweet_id, n]))
  if (!byId.has(selectedId)) return { before: [], after: [] }
  const before: string[] = [],
    after: string[] = [],
    seen = new Set([selectedId])
  let cursor = byId.get(selectedId)
  while (cursor?.reply_to_tweet_id && before.length < 20) {
    const parent = byId.get(cursor.reply_to_tweet_id)
    if (!parent || seen.has(parent.tweet_id)) break
    seen.add(parent.tweet_id)
    before.unshift(parent.tweet_id)
    cursor = parent
  }
  const children = new Map<string, string[]>()
  for (const node of [...nodes].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) ||
      a.tweet_id.localeCompare(b.tweet_id),
  )) {
    if (node.reply_to_tweet_id)
      children.set(node.reply_to_tweet_id, [
        ...(children.get(node.reply_to_tweet_id) ?? []),
        node.tweet_id,
      ])
  }
  const queue = [...(children.get(selectedId) ?? [])]
  while (queue.length && after.length < 20) {
    // Prioritize the nearby continuation over a years-later direct reply.
    queue.sort(
      (a, b) =>
        byId.get(a)!.created_at.localeCompare(byId.get(b)!.created_at) ||
        a.localeCompare(b),
    )
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    after.push(id)
    queue.push(...(children.get(id) ?? []))
  }
  return { before, after }
}
