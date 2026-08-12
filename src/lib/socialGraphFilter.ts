import type {
  SocialGraphEdge,
  SocialGraphNode,
  SocialGraphSnapshot,
} from './socialGraph'

export const MAX_VISIBLE_EDGES = 12_000

export interface SocialGraphFilters {
  minimumFollowers: number
  minimumStrength: number
  maximumNodes: number
}

export interface FilteredSocialGraph {
  nodes: SocialGraphNode[]
  edges: SocialGraphEdge[]
  omittedEdgesForPerformance: number
}

function nodePriority(node: SocialGraphNode): number {
  return Math.log10(node.followers + 10) * 10 + node.degree
}

export function filterSocialGraph(
  snapshot: SocialGraphSnapshot,
  filters: SocialGraphFilters,
  maxVisibleEdges = MAX_VISIBLE_EDGES,
): FilteredSocialGraph {
  const eligible = snapshot.nodes
    .filter((node) => node.followers >= filters.minimumFollowers)
    .sort(
      (left, right) =>
        nodePriority(right) - nodePriority(left) ||
        right.followers - left.followers ||
        left.username.localeCompare(right.username),
    )
    .slice(0, Math.max(1, Math.floor(filters.maximumNodes)))
  const nodeIds = new Set(eligible.map((node) => node.id))
  const matchingEdges = snapshot.edges.filter(
    (edge) =>
      edge.strength >= filters.minimumStrength &&
      nodeIds.has(edge.source) &&
      nodeIds.has(edge.target),
  )
  const edges = matchingEdges.slice(0, maxVisibleEdges)

  // Preserve the user's requested node population. Nodes without a surviving
  // edge are still useful evidence that the current edge threshold is strict.
  return {
    nodes: eligible,
    edges,
    omittedEdgesForPerformance: matchingEdges.length - edges.length,
  }
}

export function followerSliderToCount(
  sliderValue: number,
  maximumFollowers: number,
): number {
  if (sliderValue <= 0 || maximumFollowers <= 0) return 0
  const ratio = Math.min(1, sliderValue / 100)
  return Math.round(Math.expm1(Math.log1p(maximumFollowers) * ratio))
}

export function followerCountToSlider(
  followers: number,
  maximumFollowers: number,
): number {
  if (followers <= 0 || maximumFollowers <= 0) return 0
  return Math.round(
    (100 * Math.log1p(followers)) / Math.log1p(maximumFollowers),
  )
}
