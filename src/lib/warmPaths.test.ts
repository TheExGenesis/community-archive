import type { SocialGraphSnapshot } from './socialGraph'
import {
  buildWarmGraph,
  findIntroductions,
  findWarmPaths,
  WarmPathProblem,
} from './warmPaths'

const node = (username: string, followers = 100) => ({
  id: `account:${username}`,
  accountId: username,
  username,
  label: username.toUpperCase(),
  followers,
  cluster: 'c',
  x: 0,
  y: 0,
  degree: 0,
  totalInteractions: 0,
})

/** A mutual edge with `n` interactions each way in 2026. */
const edge = (a: string, b: string, n: number, year = 2026) => ({
  source: `account:${a}`,
  target: `account:${b}`,
  strength: 1,
  mutualInteractions: n,
  yearlyInteractions: [[year, n, n, 100, 100]] as Array<
    [number, number, number, number, number]
  >,
})

function snapshot(
  nodes: ReturnType<typeof node>[],
  edges: ReturnType<typeof edge>[],
): SocialGraphSnapshot {
  return {
    version: 2,
    generatedAt: '2026-11-20T00:00:00Z',
    semantics: {} as SocialGraphSnapshot['semantics'],
    temporal: { minYear: 2020, maxYear: 2026 },
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      totalMutualEdgeCount: edges.length,
      clusterCount: 1,
      maxFollowers: 0,
      maxStrength: 1,
      suggestedMinStrength: 0,
      edgePayloadTruncated: false,
    },
    clusters: [],
    nodes,
    edges,
  }
}

// me — friend (strong) — star; me — weak — star; me — friend — other
const graph = buildWarmGraph(
  snapshot(
    [
      node('me'),
      node('friend'),
      node('weak'),
      node('star', 50_000),
      node('other', 20_000),
      node('loner'),
    ],
    [
      edge('me', 'friend', 40),
      edge('friend', 'star', 40),
      edge('me', 'weak', 1, 2015),
      edge('weak', 'star', 1, 2015),
      edge('friend', 'other', 10),
    ],
  ),
)

describe('findWarmPaths', () => {
  it('prefers the path through strong, recent ties', () => {
    const paths = findWarmPaths(graph, '@Me', 'star')
    expect(paths.map((p) => p.people.map((x) => x.username))).toEqual([
      ['me', 'friend', 'star'],
      ['me', 'weak', 'star'],
    ])
    expect(paths[0].score).toBeGreaterThan(paths[1].score)
    expect(paths[0].ties[0]).toMatchObject({ out: 40, back: 40, years: 1 })
  })

  it('explains people it cannot route', () => {
    expect(() => findWarmPaths(graph, 'me', 'nobody')).toThrow(WarmPathProblem)
    expect(() => findWarmPaths(graph, 'me', 'loner')).toThrow(/no two-way tie/)
    expect(() => findWarmPaths(graph, 'me', 'me')).toThrow(/two different/)
  })

  it('respects the hop limit', () => {
    expect(() => findWarmPaths(graph, 'me', 'star', { maxHops: 1 })).toThrow(
      /No path within 1 hops/,
    )
  })
})

describe('findIntroductions', () => {
  it('lists second-degree people with their introducers', () => {
    const { targets, connectors } = findIntroductions(graph, 'me', {
      minFollowers: 10_000,
    })
    expect(targets.map((t) => t.person.username)).toEqual(['star', 'other'])
    expect(targets[0].routes[0].people.map((p) => p.username)).toEqual([
      'me',
      'friend',
      'star',
    ])
    expect(connectors).toEqual([
      expect.objectContaining({
        person: expect.objectContaining({ username: 'friend' }),
        reaches: expect.arrayContaining(['star', 'other']),
      }),
    ])
  })

  it('leaves out direct ties and small accounts', () => {
    const { targets } = findIntroductions(graph, 'me', { minFollowers: 30_000 })
    expect(targets.map((t) => t.person.username)).toEqual(['star'])
  })
})
