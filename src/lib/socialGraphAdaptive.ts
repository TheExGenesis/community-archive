import { UndirectedGraph } from 'graphology'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import type { SocialGraphEdge, SocialGraphNode } from './socialGraph'
import {
  clusterGraph,
  type AdaptiveClusteringAlgorithm,
} from './socialGraphClustering'

export type AdaptiveLayoutAlgorithm = 'force-directed' | 'clustered-force'
export type { AdaptiveClusteringAlgorithm } from './socialGraphClustering'

export interface AdaptiveGraphOptions {
  clustering: AdaptiveClusteringAlgorithm
  layout: AdaptiveLayoutAlgorithm
}

export interface AdaptiveGraphResult {
  positions: Record<string, { x: number; y: number }>
  communities: Record<string, number>
  communityCount: number
  modularity: number
  clusterMs: number
  layoutMs: number
  totalMs: number
}

function buildAdaptiveGraph(
  nodes: SocialGraphNode[],
  edges: SocialGraphEdge[],
) {
  const graph = new UndirectedGraph()
  for (const node of nodes) {
    graph.addNode(node.id, {
      x: node.x,
      y: node.y,
      size: Math.max(1, Math.log10(node.followers + 10)),
    })
  }
  edges.forEach((edge, index) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return
    graph.addUndirectedEdgeWithKey(
      `adaptive:${index}`,
      edge.source,
      edge.target,
      {
        weight: Math.max(0.01, edge.strength),
      },
    )
  })
  return graph
}

function placeIsolates(
  graph: UndirectedGraph,
  communities: Record<string, number>,
) {
  const isolates = graph.filterNodes((node) => communities[node] === -1).sort()
  if (!isolates.length) return
  const connected = graph.filterNodes((node) => communities[node] !== -1)
  const extent = connected.reduce((maximum, node) => {
    const { x, y } = graph.getNodeAttributes(node)
    return Math.max(maximum, Math.abs(Number(x) || 0), Math.abs(Number(y) || 0))
  }, 8)
  isolates.forEach((node, index) => {
    const angle = (index / isolates.length) * Math.PI * 2
    const radius = extent * (1.2 + (index % 3) * 0.035)
    graph.mergeNodeAttributes(node, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    })
  })
}

interface ForceNode extends SimulationNodeDatum {
  id: string
  community: number
  radius: number
}

interface ForceLink extends SimulationLinkDatum<ForceNode> {
  weight: number
}

function forceDirectedLayout(
  graph: UndirectedGraph,
  communities: Record<string, number>,
  clustered: boolean,
) {
  const communityCount = Math.max(
    1,
    new Set(Object.values(communities).filter((community) => community >= 0))
      .size,
  )
  const nodes: ForceNode[] = graph
    .filterNodes((node) => communities[node] !== -1)
    .map((node) => {
      const attributes = graph.getNodeAttributes(node)
      const community = communities[node] ?? 0
      const communityAngle = (community / communityCount) * Math.PI * 2
      const clusterRadius = Math.max(120, Math.sqrt(communityCount) * 55)
      return {
        id: node,
        community,
        radius: 3 + Number(attributes.size || 1) * 1.4,
        x: clustered ? Math.cos(communityAngle) * clusterRadius : attributes.x,
        y: clustered ? Math.sin(communityAngle) * clusterRadius : attributes.y,
      }
    })
  const activeIds = new Set(nodes.map((node) => node.id))
  const links: ForceLink[] = graph.edges().flatMap((edge) => {
    const source = graph.source(edge)
    const target = graph.target(edge)
    if (!activeIds.has(source) || !activeIds.has(target)) return []
    return [
      {
        source,
        target,
        weight: Number(graph.getEdgeAttribute(edge, 'weight')) || 1,
      },
    ]
  })
  const simulation = forceSimulation(nodes)
    .stop()
    .force(
      'links',
      forceLink<ForceNode, ForceLink>(links)
        .id((node) => node.id)
        .distance((link) =>
          clustered &&
          (link.source as ForceNode).community !==
            (link.target as ForceNode).community
            ? 115
            : 38,
        )
        .strength((link) => Math.min(0.8, 0.08 + link.weight * 0.1)),
    )
    .force(
      'charge',
      forceManyBody<ForceNode>()
        .strength(clustered ? -75 : -55)
        .distanceMax(450)
        .theta(0.95),
    )
    .force(
      'collision',
      forceCollide<ForceNode>()
        .radius((node) => node.radius + 2)
        .strength(0.8),
    )
    .force('center', forceCenter(0, 0))
    .alphaDecay(0.035)
    .velocityDecay(0.35)

  if (clustered) {
    const clusterRadius = Math.max(120, Math.sqrt(communityCount) * 55)
    simulation
      .force(
        'cluster-x',
        forceX<ForceNode>(
          (node) =>
            Math.cos((node.community / communityCount) * Math.PI * 2) *
            clusterRadius,
        ).strength(0.11),
      )
      .force(
        'cluster-y',
        forceY<ForceNode>(
          (node) =>
            Math.sin((node.community / communityCount) * Math.PI * 2) *
            clusterRadius,
        ).strength(0.11),
      )
  }

  simulation.tick(clustered ? 140 : 120)
  for (const node of nodes) {
    graph.mergeNodeAttributes(node.id, { x: node.x || 0, y: node.y || 0 })
  }
}

export function runAdaptiveGraph(
  nodes: SocialGraphNode[],
  edges: SocialGraphEdge[],
  options: AdaptiveGraphOptions,
  now: () => number = () => performance.now(),
): AdaptiveGraphResult {
  const startedAt = now()
  const graph = buildAdaptiveGraph(nodes, edges)
  const clusterStartedAt = now()
  const { communities, communityCount, modularity } = clusterGraph(
    graph,
    options.clustering,
  )
  const clusterEndedAt = now()

  const layoutStartedAt = now()
  if (graph.order > 1) {
    forceDirectedLayout(
      graph,
      communities,
      options.layout === 'clustered-force',
    )
  }
  placeIsolates(graph, communities)
  const layoutEndedAt = now()
  const positions = Object.fromEntries(
    graph.mapNodes((node, attributes) => [
      node,
      { x: Number(attributes.x) || 0, y: Number(attributes.y) || 0 },
    ]),
  )

  return {
    positions,
    communities,
    communityCount,
    modularity,
    clusterMs: clusterEndedAt - clusterStartedAt,
    layoutMs: layoutEndedAt - layoutStartedAt,
    totalMs: layoutEndedAt - startedAt,
  }
}
