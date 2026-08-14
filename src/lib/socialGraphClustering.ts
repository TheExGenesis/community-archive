import type { UndirectedGraph } from 'graphology'
import louvain from 'graphology-communities-louvain'

export type AdaptiveClusteringAlgorithm = 'louvain' | 'label-propagation'

export interface GraphClusteringResult {
  communities: Record<string, number>
  communityCount: number
  modularity: number
}

function normalizeCommunities(
  graph: UndirectedGraph,
  raw: Record<string, number>,
): Record<string, number> {
  const membersByCommunity = new Map<number, string[]>()
  graph.forEachNode((node) => {
    if (graph.degree(node) === 0) return
    const community = raw[node] ?? 0
    const members = membersByCommunity.get(community) || []
    members.push(node)
    membersByCommunity.set(community, members)
  })
  const remapped = new Map(
    Array.from(membersByCommunity.entries())
      .sort(
        (left, right) => right[1].length - left[1].length || left[0] - right[0],
      )
      .map(([community], index) => [community, index]),
  )
  return Object.fromEntries(
    graph.mapNodes((node) => [
      node,
      graph.degree(node) === 0 ? -1 : remapped.get(raw[node] ?? 0) || 0,
    ]),
  )
}

function labelPropagation(graph: UndirectedGraph): Record<string, number> {
  const nodes = graph.nodes().sort()
  const labels = Object.fromEntries(nodes.map((node, index) => [node, index]))
  for (let pass = 0; pass < 20; pass += 1) {
    let changed = false
    for (const node of nodes) {
      if (graph.degree(node) === 0) continue
      const weights = new Map<number, number>()
      graph.forEachNeighbor(node, (neighbor) => {
        const edge = graph.edge(node, neighbor)
        const weight = Number(graph.getEdgeAttribute(edge, 'weight')) || 1
        const label = labels[neighbor]
        weights.set(label, (weights.get(label) || 0) + weight)
      })
      const selected = Array.from(weights.entries()).sort(
        (left, right) => right[1] - left[1] || left[0] - right[0],
      )[0]?.[0]
      if (selected !== undefined && selected !== labels[node]) {
        labels[node] = selected
        changed = true
      }
    }
    if (!changed) break
  }
  return labels
}

function partitionModularity(
  graph: UndirectedGraph,
  communities: Record<string, number>,
): number {
  let totalWeight = 0
  const weightedDegree = new Map<string, number>()
  const internalWeight = new Map<number, number>()
  graph.forEachEdge((edge, attributes, source, target) => {
    const weight = Number(attributes.weight) || 1
    totalWeight += weight
    weightedDegree.set(source, (weightedDegree.get(source) || 0) + weight)
    weightedDegree.set(target, (weightedDegree.get(target) || 0) + weight)
    const community = communities[source]
    if (community >= 0 && community === communities[target]) {
      internalWeight.set(
        community,
        (internalWeight.get(community) || 0) + weight,
      )
    }
  })
  if (!totalWeight) return 0
  const degreeByCommunity = new Map<number, number>()
  graph.forEachNode((node) => {
    const community = communities[node]
    if (community < 0) return
    degreeByCommunity.set(
      community,
      (degreeByCommunity.get(community) || 0) + (weightedDegree.get(node) || 0),
    )
  })
  let modularity = 0
  for (const [community, degree] of Array.from(degreeByCommunity.entries())) {
    modularity +=
      (internalWeight.get(community) || 0) / totalWeight -
      (degree / (2 * totalWeight)) ** 2
  }
  return modularity
}

export function clusterGraph(
  graph: UndirectedGraph,
  algorithm: AdaptiveClusteringAlgorithm,
): GraphClusteringResult {
  const louvainDetails =
    graph.size && algorithm === 'louvain'
      ? louvain.detailed(graph, {
          getEdgeWeight: 'weight',
          randomWalk: false,
          resolution: 1.1,
        })
      : undefined
  const rawCommunities = louvainDetails?.communities || labelPropagation(graph)
  const communities = normalizeCommunities(graph, rawCommunities)
  return {
    communities,
    communityCount: new Set(
      Object.values(communities).filter((community) => community >= 0),
    ).size,
    modularity:
      louvainDetails?.modularity ?? partitionModularity(graph, communities),
  }
}
