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
  startYear: number
  endYear: number
}

export function edgeForYearWindow(
  edge: SocialGraphEdge,
  startYear: number,
  endYear: number,
): SocialGraphEdge | null {
  let sourceInteractions = 0
  let targetInteractions = 0
  let sourceTotal = 0
  let targetTotal = 0
  for (const [
    year,
    sourceCount,
    targetCount,
    sourceOutgoing,
    targetOutgoing,
  ] of edge.yearlyInteractions) {
    if (year < startYear || year > endYear) continue
    sourceInteractions += sourceCount
    targetInteractions += targetCount
    sourceTotal += sourceOutgoing
    targetTotal += targetOutgoing
  }
  if (!sourceInteractions || !targetInteractions) return null
  if (!sourceTotal || !targetTotal) return null
  return {
    ...edge,
    strength: Number(
      Math.min(
        (100 * sourceInteractions) / sourceTotal,
        (100 * targetInteractions) / targetTotal,
      ).toFixed(4),
    ),
    mutualInteractions: Math.min(sourceInteractions, targetInteractions),
  }
}

export interface FilteredSocialGraph {
  nodes: SocialGraphNode[]
  edges: SocialGraphEdge[]
  omittedEdgesForPerformance: number
}

function weightedDegree(
  nodes: SocialGraphNode[],
  edges: SocialGraphEdge[],
): Map<string, number> {
  const eligibleIds = new Set(nodes.map((node) => node.id))
  const scores = new Map(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) {
    if (!eligibleIds.has(edge.source) || !eligibleIds.has(edge.target)) continue
    scores.set(edge.source, (scores.get(edge.source) || 0) + edge.strength)
    scores.set(edge.target, (scores.get(edge.target) || 0) + edge.strength)
  }
  return scores
}

export function filterSocialGraph(
  snapshot: SocialGraphSnapshot,
  filters: SocialGraphFilters,
  maxVisibleEdges = MAX_VISIBLE_EDGES,
): FilteredSocialGraph {
  const followerEligible = snapshot.nodes.filter(
    (node) => node.followers >= filters.minimumFollowers,
  )
  const strengthEligibleEdges = snapshot.edges.flatMap((edge) => {
    const windowed = edgeForYearWindow(edge, filters.startYear, filters.endYear)
    return windowed && windowed.strength >= filters.minimumStrength
      ? [windowed]
      : []
  })
  strengthEligibleEdges.sort(
    (left, right) =>
      right.strength - left.strength ||
      right.mutualInteractions - left.mutualInteractions ||
      left.source.localeCompare(right.source) ||
      left.target.localeCompare(right.target),
  )
  const centrality = weightedDegree(followerEligible, strengthEligibleEdges)
  const eligible = followerEligible
    .sort(
      (left, right) =>
        (centrality.get(right.id) || 0) - (centrality.get(left.id) || 0) ||
        right.degree - left.degree ||
        right.followers - left.followers ||
        left.username.localeCompare(right.username),
    )
    .slice(0, Math.max(1, Math.floor(filters.maximumNodes)))
  const nodeIds = new Set(eligible.map((node) => node.id))
  const matchingEdges = strengthEligibleEdges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
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

export function pinNodeInFilteredGraph(
  snapshot: SocialGraphSnapshot,
  filtered: FilteredSocialGraph,
  nodeId: string | null,
  filters: SocialGraphFilters,
  neighborLimit = 12,
): FilteredSocialGraph {
  if (!nodeId || filtered.nodes.some((node) => node.id === nodeId)) {
    return filtered
  }

  const pinnedNode = snapshot.nodes.find((node) => node.id === nodeId)
  if (!pinnedNode) return filtered

  const incidentEdges = snapshot.edges
    .flatMap((edge) => {
      if (edge.source !== nodeId && edge.target !== nodeId) return []
      const windowed = edgeForYearWindow(
        edge,
        filters.startYear,
        filters.endYear,
      )
      return windowed && windowed.strength >= filters.minimumStrength
        ? [windowed]
        : []
    })
    .sort(
      (left, right) =>
        right.strength - left.strength ||
        right.mutualInteractions - left.mutualInteractions,
    )
    .slice(0, Math.max(0, neighborLimit))

  const extraIds = new Set([nodeId])
  for (const edge of incidentEdges) {
    extraIds.add(edge.source)
    extraIds.add(edge.target)
  }
  const existingIds = new Set(filtered.nodes.map((node) => node.id))
  const extraNodes = snapshot.nodes.filter(
    (node) => extraIds.has(node.id) && !existingIds.has(node.id),
  )
  const edgeKeys = new Set(
    filtered.edges.map((edge) => `${edge.source}:${edge.target}`),
  )
  const extraEdges = incidentEdges.filter(
    (edge) => !edgeKeys.has(`${edge.source}:${edge.target}`),
  )

  return {
    ...filtered,
    nodes: [...extraNodes, ...filtered.nodes],
    edges: [...extraEdges, ...filtered.edges],
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
