export type YearRangeHandle = 'start' | 'end'

export const SOCIAL_GRAPH_DEFAULTS = {
  minimumFollowers: 517,
  startYear: 2021,
  endYear: 2026,
  minimumStrength: 0.3,
  maximumNodes: 720,
  labelPercentage: 20,
  clustering: 'louvain',
  layout: 'clustered-force',
} as const

export function getSocialGraphDefaultSettings(bounds: {
  minYear: number
  maxYear: number
  maxFollowers: number
  nodeCount: number
}) {
  const startYear = Math.max(
    bounds.minYear,
    Math.min(bounds.maxYear, SOCIAL_GRAPH_DEFAULTS.startYear),
  )
  const endYear = Math.max(
    startYear,
    Math.min(bounds.maxYear, SOCIAL_GRAPH_DEFAULTS.endYear),
  )

  return {
    ...SOCIAL_GRAPH_DEFAULTS,
    minimumFollowers: Math.min(
      SOCIAL_GRAPH_DEFAULTS.minimumFollowers,
      Math.max(0, bounds.maxFollowers),
    ),
    startYear,
    endYear,
    maximumNodes: Math.min(
      SOCIAL_GRAPH_DEFAULTS.maximumNodes,
      Math.max(0, bounds.nodeCount),
    ),
  }
}

export function updateYearRange(
  startYear: number,
  endYear: number,
  handle: YearRangeHandle,
  nextYear: number,
): [number, number] {
  if (handle === 'start') return [Math.min(nextYear, endYear), endYear]
  return [startYear, Math.max(nextYear, startYear)]
}

export function nodeIdsForLabelCoverage<T extends { id: string }>(
  nodes: T[],
  percentage: number,
  communityByNode: Map<string, string>,
  selectedCommunityId: string | null,
): Set<string> {
  const boundedPercentage = Math.max(0, Math.min(100, percentage))
  const labelCount = Math.ceil((nodes.length * boundedPercentage) / 100)
  const result = new Set(nodes.slice(0, labelCount).map((node) => node.id))

  if (selectedCommunityId) {
    for (const node of nodes) {
      if (communityByNode.get(node.id) === selectedCommunityId) {
        result.add(node.id)
      }
    }
  }

  return result
}
