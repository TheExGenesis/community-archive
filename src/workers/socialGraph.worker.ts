/// <reference lib="webworker" />

import {
  runAdaptiveGraph,
  type AdaptiveGraphOptions,
  type AdaptiveGraphResult,
} from '@/lib/socialGraphAdaptive'
import type { SocialGraphEdge, SocialGraphNode } from '@/lib/socialGraph'

export interface SocialGraphWorkerRequest {
  id: number
  nodes: SocialGraphNode[]
  edges: SocialGraphEdge[]
  options: AdaptiveGraphOptions
}

export interface SocialGraphWorkerResponse {
  id: number
  result?: AdaptiveGraphResult
  error?: string
}

self.addEventListener(
  'message',
  (event: MessageEvent<SocialGraphWorkerRequest>) => {
    const { id, nodes, edges, options } = event.data
    try {
      const response: SocialGraphWorkerResponse = {
        id,
        result: runAdaptiveGraph(nodes, edges, options),
      }
      self.postMessage(response)
    } catch (error) {
      const response: SocialGraphWorkerResponse = {
        id,
        error: error instanceof Error ? error.message : 'Adaptive graph failed',
      }
      self.postMessage(response)
    }
  },
)

export {}
