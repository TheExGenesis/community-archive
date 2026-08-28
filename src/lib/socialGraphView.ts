import type { SocialGraphEdge } from './socialGraph'

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

export function nodeIdsForOverviewLabels<T extends { id: string }>(
  nodes: T[],
  communityByNode: Map<string, string>,
  maximumLabels = 18,
  labelsPerCommunity = 2,
): Set<string> {
  const maximum = Math.max(0, Math.floor(maximumLabels))
  const perCommunity = Math.max(0, Math.floor(labelsPerCommunity))
  const result = new Set<string>()
  const communityCounts = new Map<string, number>()

  for (const node of nodes) {
    if (result.size >= maximum) break
    const community = communityByNode.get(node.id)
    if (!community || community.includes('unconnected')) continue
    const count = communityCounts.get(community) || 0
    if (count >= perCommunity) continue
    result.add(node.id)
    communityCounts.set(community, count + 1)
  }

  for (const node of nodes) {
    if (result.size >= maximum) break
    const community = communityByNode.get(node.id)
    if (!community || community.includes('unconnected')) continue
    result.add(node.id)
  }

  return result
}

export function labelSettingsForDensity(percentage: number): {
  density: number
  renderedSizeThreshold: number
} {
  const boundedPercentage = Math.max(0, Math.min(100, percentage))
  return {
    density: Math.max(0.2, 0.25 + boundedPercentage / 50),
    renderedSizeThreshold: Math.max(3, 10 - boundedPercentage / 10),
  }
}

export function communityDisplayLabel(
  members: Array<{ username: string }>,
  unconnected = false,
): string {
  if (unconnected) return 'No visible reciprocal tie'
  const handles = members.slice(0, 3).map((member) => `@${member.username}`)
  return handles.length ? `Around ${handles.join(', ')}` : 'Empty group'
}

export function edgeDirectionTotals(
  edge: SocialGraphEdge,
  startYear: number,
  endYear: number,
): { sourceToTarget: number; targetToSource: number } {
  let sourceToTarget = 0
  let targetToSource = 0
  for (const [year, sourceCount, targetCount] of edge.yearlyInteractions) {
    if (year < startYear || year > endYear) continue
    sourceToTarget += sourceCount
    targetToSource += targetCount
  }
  return { sourceToTarget, targetToSource }
}
