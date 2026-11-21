'use server'

import { requireAdmin } from '@/app/admin/data'
import { getSocialGraphSnapshot } from '@/lib/socialGraph'
import {
  buildWarmGraph,
  findIntroductions,
  findWarmPaths,
  WarmPathProblem,
  type IntroSort,
  type IntroTarget,
  type Connector,
  type WarmGraph,
  type WarmPath,
} from '@/lib/warmPaths'

// The snapshot is rebuilt daily; reusing the parsed graph for a few minutes
// keeps repeated searches from refetching several megabytes each time.
const GRAPH_TTL_MS = 10 * 60 * 1000
let cached: { graph: WarmGraph; loadedAt: number } | null = null
let loading: Promise<WarmGraph> | null = null

async function loadGraph(): Promise<WarmGraph> {
  if (cached && Date.now() - cached.loadedAt < GRAPH_TTL_MS) return cached.graph
  loading ??= getSocialGraphSnapshot()
    .then((snapshot) => {
      const graph = buildWarmGraph(snapshot)
      cached = { graph, loadedAt: Date.now() }
      return graph
    })
    .finally(() => {
      loading = null
    })
  return loading
}

export interface GraphMeta {
  generatedAt: string
  people: number
  truncated: boolean
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string }

function meta(graph: WarmGraph): GraphMeta {
  return {
    generatedAt: graph.generatedAt,
    people: graph.people.filter((p) => p.twoWayTies > 0).length,
    truncated: graph.truncated,
  }
}

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof WarmPathProblem)
    return { ok: false, error: error.message }
  console.error('[warm paths] search failed:', error)
  return {
    ok: false,
    error: 'The social graph could not be loaded. Try again in a minute.',
  }
}

const clampInt = (value: number, lo: number, hi: number, fallback: number) =>
  Number.isFinite(value)
    ? Math.min(hi, Math.max(lo, Math.round(value)))
    : fallback

export async function searchWarmPaths(input: {
  from: string
  to: string
  maxHops: number
}): Promise<Result<{ paths: WarmPath[]; graph: GraphMeta }>> {
  await requireAdmin('/tools/warm-paths')
  try {
    const graph = await loadGraph()
    const paths = findWarmPaths(graph, String(input.from), String(input.to), {
      top: 8,
      maxHops: clampInt(input.maxHops, 2, 5, 4),
    })
    return { ok: true, paths, graph: meta(graph) }
  } catch (error) {
    return failure(error)
  }
}

export async function searchIntroductions(input: {
  from: string
  minFollowers: number
  sort: IntroSort
}): Promise<
  Result<{
    targets: IntroTarget[]
    connectors: Connector[]
    graph: GraphMeta
  }>
> {
  await requireAdmin('/tools/warm-paths')
  try {
    const graph = await loadGraph()
    const sort: IntroSort = ['balanced', 'profile', 'warmth'].includes(
      input.sort,
    )
      ? input.sort
      : 'balanced'
    const result = findIntroductions(graph, String(input.from), {
      minFollowers: clampInt(input.minFollowers, 0, 100_000_000, 5000),
      sort,
    })
    return { ok: true, ...result, graph: meta(graph) }
  } catch (error) {
    return failure(error)
  }
}
