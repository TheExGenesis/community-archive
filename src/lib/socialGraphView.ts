export type YearRangeHandle = 'start' | 'end'

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
