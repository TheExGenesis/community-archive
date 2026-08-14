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
  yearlyInteractions: Array<
    [
      year: number,
      sourceInteractions: number,
      targetInteractions: number,
      sourceOutgoingInteractions: number,
      targetOutgoingInteractions: number,
    ]
  >
}

export interface SocialGraphSnapshot {
  version: 2
  generatedAt: string
  semantics: {
    interactions: string[]
    directedStrength: string
    mutualStrength: string
    mutualInteractions: string
    clusterPolicy: string
    timeWindow: string
  }
  temporal: {
    minYear: number
    maxYear: number
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
    snapshot?.version !== 2 ||
    !Number.isFinite(Date.parse(snapshot.generatedAt || '')) ||
    !Array.isArray(snapshot.nodes) ||
    !Array.isArray(snapshot.edges) ||
    !Array.isArray(snapshot.clusters) ||
    !Number.isSafeInteger(snapshot.temporal?.minYear) ||
    !Number.isSafeInteger(snapshot.temporal?.maxYear) ||
    (snapshot.temporal?.minYear || 0) > (snapshot.temporal?.maxYear || 0) ||
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
        validFinite(edge.mutualInteractions) &&
        Array.isArray(edge.yearlyInteractions) &&
        edge.yearlyInteractions.every(
          (entry) =>
            Array.isArray(entry) &&
            entry.length === 5 &&
            Number.isSafeInteger(entry[0]) &&
            validFinite(entry[1]) &&
            validFinite(entry[2]) &&
            validFinite(entry[3]) &&
            validFinite(entry[4]),
        ),
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
