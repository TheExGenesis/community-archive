import 'server-only'
import { fetchAnalyticsGatewayJson } from './clickhouseGateway'

export interface SocialGraphCluster {
  id: string
  label: string
  color: string
  nodeCount: number
}

export interface SocialGraphNode {
  id: string
  accountId: string | null
  username: string
  label: string
  followers: number
  cluster: string
  x: number
  y: number
  degree: number
  totalInteractions: number
}

export interface SocialGraphEdge {
  source: string
  target: string
  strength: number
  mutualInteractions: number
}

export interface SocialGraphSnapshot {
  version: 1
  generatedAt: string
  semantics: {
    interactions: string[]
    directedStrength: string
    mutualStrength: string
    mutualInteractions: string
    clusterPolicy: string
  }
  stats: {
    nodeCount: number
    edgeCount: number
    totalMutualEdgeCount: number
    clusterCount: number
    maxFollowers: number
    maxStrength: number
    suggestedMinStrength: number
    edgePayloadTruncated: boolean
  }
  clusters: SocialGraphCluster[]
  nodes: SocialGraphNode[]
  edges: SocialGraphEdge[]
}

function validFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateSocialGraphSnapshot(
  value: unknown,
): asserts value is SocialGraphSnapshot {
  const snapshot = value as Partial<SocialGraphSnapshot> | null
  if (
    snapshot?.version !== 1 ||
    !Number.isFinite(Date.parse(snapshot.generatedAt || '')) ||
    !Array.isArray(snapshot.nodes) ||
    !Array.isArray(snapshot.edges) ||
    !Array.isArray(snapshot.clusters) ||
    snapshot.nodes.length !== snapshot.stats?.nodeCount ||
    snapshot.edges.length !== snapshot.stats?.edgeCount ||
    !snapshot.nodes.every(
      (node) =>
        typeof node.id === 'string' &&
        typeof node.username === 'string' &&
        typeof node.label === 'string' &&
        typeof node.cluster === 'string' &&
        validFinite(node.followers) &&
        validFinite(node.x) &&
        validFinite(node.y),
    ) ||
    !snapshot.edges.every(
      (edge) =>
        typeof edge.source === 'string' &&
        typeof edge.target === 'string' &&
        validFinite(edge.strength) &&
        validFinite(edge.mutualInteractions),
    )
  ) {
    throw new Error('ClickHouse social graph response is invalid')
  }
}

export async function getSocialGraphSnapshot(): Promise<SocialGraphSnapshot> {
  const snapshot = await fetchAnalyticsGatewayJson<unknown>(
    ['social-graph'],
    undefined,
    {
      timeoutMs: 15_000,
    },
  )
  validateSocialGraphSnapshot(snapshot)
  return snapshot
}
