/**
 * Warm introduction paths over the social graph snapshot.
 *
 * A port of the control-panel `warm_paths.py` prototype onto the archive's own
 * member graph: a tie needs replies or quotes in both directions, and an intro
 * through a strong, recent, long-running tie is warmer than one through a
 * weak one. Each intermediary costs a hop penalty, and hubs with far more
 * two-way ties than anyone can keep up with cost more.
 *
 * Pure functions only, so the server action and the tests share them.
 */
import type { SocialGraphSnapshot } from './socialGraph'

/** Interactions in the snapshot's last two years count fully, older ones half. */
const OLD_WEIGHT = 0.5
/** Tie weight at which an edge's strength is 0.5. */
const K = 8
/** Multiplier per intermediary: an intro through one more person lands less often. */
const HOP = 0.75
/** Two-way ties an intermediary can have before the hub discount starts. */
const DUNBAR = 150
/** Exponent of the hub discount; 0 turns it off. */
const HUB = 0.5

export interface WarmPerson {
  accountId: string | null
  username: string
  name: string
  followers: number
  twoWayTies: number
}

export interface WarmTie {
  /** 0–1: how warm this single tie is. */
  strength: number
  /** Replies and quotes from the earlier person to the later one. */
  out: number
  /** Replies and quotes back. */
  back: number
  /** Calendar years in which both sides interacted. */
  years: number
  lastYear: number | null
}

export interface WarmPath {
  /** 0–1: product of tie strengths and hop penalties. */
  score: number
  people: WarmPerson[]
  ties: WarmTie[]
}

interface TieInfo {
  /** Interactions from the lower-index node to the higher one, and back. */
  lowToHigh: number
  highToLow: number
  years: number
  lastYear: number | null
  weight: number
}

export interface WarmGraph {
  generatedAt: string
  maxYear: number
  truncated: boolean
  people: WarmPerson[]
  byUsername: Map<string, number>
  /** Neighbour index -> edge cost, per node. */
  adj: Array<Map<number, number>>
  ties: Map<string, TieInfo>
}

const tieKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)

export class WarmPathProblem extends Error {}

export function buildWarmGraph(snapshot: SocialGraphSnapshot): WarmGraph {
  const index = new Map<string, number>()
  const people: WarmPerson[] = []
  const byUsername = new Map<string, number>()
  for (const node of snapshot.nodes) {
    index.set(node.id, people.length)
    byUsername.set(node.username.toLowerCase(), people.length)
    people.push({
      accountId: node.accountId,
      username: node.username,
      name: node.label,
      followers: node.followers,
      twoWayTies: 0,
    })
  }
  const adj = people.map(() => new Map<number, number>())
  const ties = new Map<string, TieInfo>()
  const recentFrom = snapshot.temporal.maxYear - 1

  for (const edge of snapshot.edges) {
    const s = index.get(edge.source)
    const t = index.get(edge.target)
    if (s === undefined || t === undefined || s === t) continue
    let sw = 0
    let tw = 0
    let sTotal = 0
    let tTotal = 0
    let years = 0
    let lastYear: number | null = null
    for (const [year, toTarget, toSource] of edge.yearlyInteractions) {
      const f = year >= recentFrom ? 1 : OLD_WEIGHT
      sw += f * toTarget
      tw += f * toSource
      sTotal += toTarget
      tTotal += toSource
      if (toTarget > 0 && toSource > 0) {
        years += 1
        lastYear = Math.max(lastYear ?? year, year)
      }
    }
    if (edge.yearlyInteractions.length === 0) {
      sw = tw = sTotal = tTotal = edge.mutualInteractions
    }
    if (sw <= 0 || tw <= 0) continue
    const weight = Math.sqrt(sw * tw) + years
    const cost = -Math.log(weight / (weight + K))
    adj[s].set(t, cost)
    adj[t].set(s, cost)
    ties.set(tieKey(s, t), {
      lowToHigh: s < t ? sTotal : tTotal,
      highToLow: s < t ? tTotal : sTotal,
      years,
      lastYear,
      weight,
    })
  }
  people.forEach((person, i) => (person.twoWayTies = adj[i].size))

  return {
    generatedAt: snapshot.generatedAt,
    maxYear: snapshot.temporal.maxYear,
    truncated: snapshot.stats.edgePayloadTruncated,
    people,
    byUsername,
    adj,
    ties,
  }
}

/** Cost of passing through an intermediary: the hop penalty plus the hub discount. */
function viaCost(graph: WarmGraph, node: number): number {
  return (
    -Math.log(HOP) + HUB * Math.log(Math.max(1, graph.adj[node].size / DUNBAR))
  )
}

/** Minimal binary heap of [cost, node]. */
class MinHeap {
  private items: Array<[number, number]> = []
  get size() {
    return this.items.length
  }
  push(item: [number, number]) {
    const a = this.items
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p][0] <= a[i][0]) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop(): [number, number] | undefined {
    const a = this.items
    const top = a[0]
    const last = a.pop()
    if (a.length > 0 && last) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

/** Cheapest cost to every node within maxHops; each intermediary adds viaCost. */
export function dijkstra(graph: WarmGraph, source: number, maxHops: number) {
  const dist = new Map<number, number>([[source, 0]])
  const prev = new Map<number, number>()
  const hops = new Map<number, number>([[source, 0]])
  const heap = new MinHeap()
  heap.push([0, source])
  while (heap.size > 0) {
    const [d, u] = heap.pop()!
    if (d > (dist.get(u) ?? Infinity) || (hops.get(u) ?? 0) >= maxHops) continue
    const through = u === source ? 0 : viaCost(graph, u)
    for (const [v, cost] of Array.from(graph.adj[u])) {
      const nd = d + cost + through
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd)
        prev.set(v, u)
        hops.set(v, (hops.get(u) ?? 0) + 1)
        heap.push([nd, v])
      }
    }
  }
  return { dist, prev }
}

function walk(prev: Map<number, number>, node: number): number[] {
  const out = [node]
  while (prev.has(out[out.length - 1])) out.push(prev.get(out[out.length - 1])!)
  return out
}

export function resolvePerson(graph: WarmGraph, handle: string): number {
  const clean = handle.trim().replace(/^@/, '').toLowerCase()
  const node = graph.byUsername.get(clean)
  if (node === undefined)
    throw new WarmPathProblem(
      `@${clean || '?'} is not in the social graph (members with recorded replies or quotes only).`,
    )
  if (graph.adj[node].size === 0)
    throw new WarmPathProblem(
      `@${graph.people[node].username} has no two-way tie in the graph, so no warm path exists.`,
    )
  return node
}

function describe(graph: WarmGraph, cost: number, path: number[]): WarmPath {
  const ties: WarmTie[] = []
  for (let i = 0; i + 1 < path.length; i++) {
    const x = path[i]
    const y = path[i + 1]
    const info = graph.ties.get(tieKey(x, y))!
    ties.push({
      strength: Number((info.weight / (info.weight + K)).toFixed(3)),
      out: x < y ? info.lowToHigh : info.highToLow,
      back: x < y ? info.highToLow : info.lowToHigh,
      years: info.years,
      lastYear: info.lastYear,
    })
  }
  return {
    score: Number(Math.exp(-cost).toFixed(3)),
    people: path.map((n) => graph.people[n]),
    ties,
  }
}

/** The warmest distinct paths between two members, best first. */
export function findWarmPaths(
  graph: WarmGraph,
  from: string,
  to: string,
  { top = 8, maxHops = 4 }: { top?: number; maxHops?: number } = {},
): WarmPath[] {
  const src = resolvePerson(graph, from)
  const dst = resolvePerson(graph, to)
  if (src === dst) throw new WarmPathProblem('Pick two different people.')
  const half = Math.ceil(maxHops / 2)
  const a = dijkstra(graph, src, half)
  const b = dijkstra(graph, dst, maxHops - half)
  const meets: Array<[number, number]> = []
  for (const [v, dv] of Array.from(a.dist)) {
    const dt = b.dist.get(v)
    if (dt === undefined) continue
    const via = v === src || v === dst ? 0 : viaCost(graph, v)
    meets.push([dv + dt + via, v])
  }
  meets.sort((x, y) => x[0] - y[0])
  const seen = new Set<string>()
  const out: WarmPath[] = []
  for (const [total, via] of meets) {
    const path = [...walk(a.prev, via).reverse(), ...walk(b.prev, via).slice(1)]
    const key = path.join('>')
    if (new Set(path).size !== path.length || seen.has(key)) continue
    seen.add(key)
    out.push(describe(graph, total, path))
    if (out.length >= top) break
  }
  if (out.length === 0)
    throw new WarmPathProblem(`No path within ${maxHops} hops.`)
  return out
}

export type IntroSort = 'balanced' | 'profile' | 'warmth'

export interface IntroTarget {
  person: WarmPerson
  score: number
  hops: number
  routes: WarmPath[]
}

export interface Connector {
  person: WarmPerson
  strength: number
  reaches: string[]
}

/**
 * Members with the largest followings within reach who are not already
 * direct ties, each with up to three routes, plus the direct ties who can
 * introduce you to the most of them.
 */
export function findIntroductions(
  graph: WarmGraph,
  from: string,
  {
    minFollowers = 5000,
    maxHops = 2,
    sort = 'balanced',
    top = 30,
  }: {
    minFollowers?: number
    maxHops?: number
    sort?: IntroSort
    top?: number
  } = {},
): { targets: IntroTarget[]; connectors: Connector[] } {
  const src = resolvePerson(graph, from)
  const { dist, prev } = dijkstra(graph, src, maxHops)
  const followers = (n: number) => graph.people[n].followers
  const rank: Record<IntroSort, (n: number) => number> = {
    profile: followers,
    warmth: (n) => -dist.get(n)!,
    balanced: (n) => Math.exp(-dist.get(n)!) * Math.log10(followers(n) + 10),
  }
  const mine = graph.adj[src]
  const targets = Array.from(dist.keys())
    .filter(
      (n) =>
        n !== src &&
        !mine.has(n) &&
        followers(n) >= minFollowers &&
        walk(prev, n).length - 1 >= 2,
    )
    .sort((x, y) => rank[sort](y) - rank[sort](x))
    .slice(0, top)

  const out: IntroTarget[] = targets.map((t) => {
    // Every direct tie who also knows the target is a possible introducer.
    const viaFriends: Array<[number, number[]]> = []
    for (const [f, cost] of Array.from(mine)) {
      const second = graph.adj[t].get(f)
      if (second === undefined) continue
      viaFriends.push([cost + second + viaCost(graph, f), [src, f, t]])
    }
    viaFriends.sort((x, y) => x[0] - y[0])
    let routes = viaFriends.slice(0, 3)
    const best: [number, number[]] = [dist.get(t)!, walk(prev, t).reverse()]
    if (routes.length === 0 || best[0] < routes[0][0] - 1e-9)
      routes = [best, ...routes.slice(0, 2)]
    const described = routes.map(([c, p]) => describe(graph, c, p))
    return {
      person: graph.people[t],
      score: described[0].score,
      hops: described[0].ties.length,
      routes: described,
    }
  })

  const targetSet = new Set(targets)
  const connectors = Array.from(mine.entries())
    .map(([f, cost]) => ({
      f,
      cost,
      reaches: Array.from(graph.adj[f].keys()).filter((n) => targetSet.has(n)),
    }))
    .filter((c) => c.reaches.length > 1)
    .sort((x, y) => y.reaches.length - x.reaches.length || x.cost - y.cost)
    .slice(0, 16)
    .map((c) => ({
      person: graph.people[c.f],
      strength: Number(Math.exp(-c.cost).toFixed(3)),
      reaches: c.reaches.map((n) => graph.people[n].username),
    }))

  return { targets: out, connectors }
}
