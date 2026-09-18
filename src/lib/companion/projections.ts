import type { DigestEdition } from '@/lib/digest/types'
import type { SocialGraphSnapshot } from '@/lib/socialGraph'
import type { DigestData, GraphData } from './contract'

export function compactDigest(
  edition: DigestEdition | null,
  q = '',
  username = '',
): DigestData {
  if (!edition || edition.status !== 'published')
    return {
      date: null,
      summary: [],
      stories: [],
      preview: false,
      matched: false,
    }
  const terms = q.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const ranked = edition.content.stories
    .map((story, index) => {
      const text =
        `${story.keyword} ${story.title} ${story.subtitle} ${story.bullets.join(' ')}`.toLocaleLowerCase()
      const tweets = [...story.bangers, ...story.commentary]
      const score =
        terms.filter((term) => text.includes(term)).length +
        (username &&
        tweets.some((t) => t.username.toLowerCase() === username.toLowerCase())
          ? 3
          : 0)
      return { story, score, index }
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
  return {
    date: edition.digestDate,
    summary: edition.content.executiveSummary,
    preview: !!edition.isPreview,
    matched: ranked.some((s) => s.score > 0),
    stories: ranked.slice(0, 8).map(({ story, score }) => ({
      slug: story.slug,
      title: story.title,
      subtitle: story.subtitle,
      category: story.category || story.keyword,
      bullets: story.bullets,
      tweets: story.bangers.slice(0, 2),
      relevant: score > 0,
      href: `/digest/${edition.digestDate}/${encodeURIComponent(story.slug)}`,
    })),
  }
}

export function compactGraph(
  snapshot: SocialGraphSnapshot,
  username: string,
): GraphData {
  const focus = snapshot.nodes.find(
    (n) => n.username.toLowerCase() === username.toLowerCase(),
  )
  const person = (node: SocialGraphSnapshot['nodes'][number]) => ({
    id: node.id,
    username: node.username,
    name: node.label,
  })
  const byId = new Map(snapshot.nodes.map((n) => [n.id, n]))
  const edges = focus
    ? snapshot.edges
        .filter((e) => e.source === focus.id || e.target === focus.id)
        .sort(
          (a, b) =>
            b.strength - a.strength ||
            b.mutualInteractions - a.mutualInteractions,
        )
    : []
  return {
    focus: focus ? person(focus) : null,
    neighbors: edges.slice(0, 8).flatMap((e) => {
      const node = byId.get(e.source === focus?.id ? e.target : e.source)
      return node
        ? [
            {
              ...person(node),
              strength: e.strength,
              interactions: e.mutualInteractions,
            },
          ]
        : []
    }),
    generatedAt: snapshot.generatedAt,
    timeWindow: snapshot.semantics.timeWindow,
    truncated: snapshot.stats.edgePayloadTruncated || edges.length > 8,
  }
}
