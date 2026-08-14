import { UndirectedGraph } from 'graphology'
import { clusterGraph } from './socialGraphClustering'

function twoCommunityGraph() {
  const graph = new UndirectedGraph()
  ;['a', 'b', 'c', 'd', 'e'].forEach((node) => graph.addNode(node))
  graph.addEdge('a', 'b', { weight: 5 })
  graph.addEdge('c', 'd', { weight: 5 })
  graph.addEdge('b', 'c', { weight: 0.1 })
  return graph
}

describe.each(['louvain', 'label-propagation'] as const)(
  '%s active graph clustering',
  (algorithm) => {
    it('groups strongly connected pairs and leaves isolates unclustered', () => {
      const result = clusterGraph(twoCommunityGraph(), algorithm)

      expect(result.communities.a).toBe(result.communities.b)
      expect(result.communities.c).toBe(result.communities.d)
      expect(result.communities.a).not.toBe(result.communities.c)
      expect(result.communities.e).toBe(-1)
      expect(result.communityCount).toBe(2)
      expect(result.modularity).toBeGreaterThan(0.4)
    })
  },
)
