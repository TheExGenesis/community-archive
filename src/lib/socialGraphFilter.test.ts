import {
  filterSocialGraph,
  followerCountToSlider,
  followerSliderToCount,
} from './socialGraphFilter'
import type { SocialGraphSnapshot } from './socialGraph'

const snapshot = {
  version: 1,
  nodes: [
    { id: 'a', username: 'a', followers: 100, degree: 10 },
    { id: 'b', username: 'b', followers: 10, degree: 2 },
    { id: 'c', username: 'c', followers: 0, degree: 1 },
  ],
  edges: [
    { source: 'a', target: 'b', strength: 10 },
    { source: 'a', target: 'c', strength: 1 },
  ],
} as SocialGraphSnapshot

describe('social graph filtering', () => {
  it('applies follower, node, and strength limits without mutating the snapshot', () => {
    const filtered = filterSocialGraph(snapshot, {
      minimumFollowers: 5,
      minimumStrength: 5,
      maximumNodes: 3,
    })
    expect(filtered.nodes.map((node) => node.id)).toEqual(['a', 'b'])
    expect(filtered.edges).toHaveLength(1)
    expect(snapshot.nodes).toHaveLength(3)
  })

  it('caps visible edges and reports omissions', () => {
    const filtered = filterSocialGraph(
      snapshot,
      { minimumFollowers: 0, minimumStrength: 0, maximumNodes: 3 },
      1,
    )
    expect(filtered.edges).toHaveLength(1)
    expect(filtered.omittedEdgesForPerformance).toBe(1)
  })

  it('keeps the most central nodes when the node budget is reduced', () => {
    const centralSnapshot = {
      ...snapshot,
      nodes: [
        {
          id: 'celebrity',
          username: 'celebrity',
          followers: 1_000_000,
          degree: 1,
        },
        { id: 'hub', username: 'hub', followers: 100, degree: 3 },
        { id: 'peer1', username: 'peer1', followers: 50, degree: 1 },
        { id: 'peer2', username: 'peer2', followers: 40, degree: 1 },
      ],
      edges: [
        { source: 'hub', target: 'peer1', strength: 4 },
        { source: 'hub', target: 'peer2', strength: 3 },
        { source: 'celebrity', target: 'peer1', strength: 0.1 },
      ],
    } as SocialGraphSnapshot
    const filtered = filterSocialGraph(centralSnapshot, {
      minimumFollowers: 0,
      minimumStrength: 1,
      maximumNodes: 2,
    })
    expect(filtered.nodes.map((node) => node.id)).toEqual(['hub', 'peer1'])
    expect(filtered.edges).toHaveLength(1)
  })

  it('maps follower counts through a reversible logarithmic slider', () => {
    const count = followerSliderToCount(50, 1_000_000)
    expect(count).toBeGreaterThan(900)
    expect(count).toBeLessThan(1_100)
    expect(followerCountToSlider(count, 1_000_000)).toBeCloseTo(50, 0)
  })
})
