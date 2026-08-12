'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { UndirectedGraph } from 'graphology'
import Sigma from 'sigma'
import { Minus, Plus, RotateCcw, Search, X } from 'lucide-react'
import type {
  SocialGraphCluster,
  SocialGraphEdge,
  SocialGraphNode,
  SocialGraphSnapshot,
} from '@/lib/socialGraph'
import {
  filterSocialGraph,
  followerSliderToCount,
} from '@/lib/socialGraphFilter'
import { MUTED, SERIF } from '@/components/portal/styles'

interface NodeAttributes {
  label: string
  x: number
  y: number
  size: number
  color: string
  hidden?: boolean
}

interface EdgeAttributes {
  size: number
  color: string
  strength: number
}

const DEFAULT_MAX_VISIBLE_NODES = 650

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value)
}

function clusterMap(clusters: SocialGraphCluster[]) {
  return new Map(clusters.map((cluster) => [cluster.id, cluster]))
}

function nodeSize(followers: number): number {
  return Math.max(2.5, Math.min(11, 2.5 + Math.log10(followers + 1) * 1.2))
}

function edgeSize(strength: number): number {
  return Math.max(0.35, Math.min(3.2, 0.35 + Math.sqrt(strength) * 0.32))
}

function createGraph(
  nodes: SocialGraphNode[],
  edges: SocialGraphEdge[],
  clusters: Map<string, SocialGraphCluster>,
): UndirectedGraph<NodeAttributes, EdgeAttributes> {
  const graph = new UndirectedGraph<NodeAttributes, EdgeAttributes>()
  for (const node of nodes) {
    graph.addNode(node.id, {
      label: node.label || `@${node.username}`,
      x: node.x,
      y: node.y,
      size: nodeSize(node.followers),
      color: clusters.get(node.cluster)?.color || '#71717a',
    })
  }
  edges.forEach((edge, index) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return
    graph.addUndirectedEdgeWithKey(`edge:${index}`, edge.source, edge.target, {
      size: edgeSize(edge.strength),
      strength: edge.strength,
      color: 'rgba(148, 163, 184, 0.24)',
    })
  })
  return graph
}

function Slider({
  label,
  value,
  displayValue,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  displayValue: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-3 text-[12px] font-medium">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-500 dark:text-[#a7a7b4]">
          {displayValue}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-emerald-500"
      />
    </label>
  )
}

export default function SocialGraphExplorer({
  snapshot,
}: {
  snapshot: SocialGraphSnapshot
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<Sigma<NodeAttributes, EdgeAttributes> | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [followerSlider, setFollowerSlider] = useState(0)
  const [minimumStrength, setMinimumStrength] = useState(
    snapshot.stats.suggestedMinStrength,
  )
  const [maximumNodes, setMaximumNodes] = useState(
    Math.min(DEFAULT_MAX_VISIBLE_NODES, snapshot.stats.nodeCount),
  )
  const deferredFollowerSlider = useDeferredValue(followerSlider)
  const deferredMinimumStrength = useDeferredValue(minimumStrength)
  const deferredMaximumNodes = useDeferredValue(maximumNodes)
  const minimumFollowers = followerSliderToCount(
    followerSlider,
    snapshot.stats.maxFollowers,
  )
  const appliedMinimumFollowers = followerSliderToCount(
    deferredFollowerSlider,
    snapshot.stats.maxFollowers,
  )
  const isPending =
    deferredFollowerSlider !== followerSlider ||
    deferredMinimumStrength !== minimumStrength ||
    deferredMaximumNodes !== maximumNodes
  const clusters = useMemo(() => clusterMap(snapshot.clusters), [snapshot])
  const nodeById = useMemo(
    () => new Map(snapshot.nodes.map((node) => [node.id, node])),
    [snapshot.nodes],
  )
  const filtered = useMemo(
    () =>
      filterSocialGraph(snapshot, {
        minimumFollowers: appliedMinimumFollowers,
        minimumStrength: deferredMinimumStrength,
        maximumNodes: deferredMaximumNodes,
      }),
    [
      snapshot,
      appliedMinimumFollowers,
      deferredMinimumStrength,
      deferredMaximumNodes,
    ],
  )
  const neighborIds = useMemo(() => {
    const result = new Set<string>()
    if (!selectedNodeId && !hoveredNodeId) return result
    const focus = hoveredNodeId || selectedNodeId
    for (const edge of filtered.edges) {
      if (edge.source === focus) result.add(edge.target)
      if (edge.target === focus) result.add(edge.source)
    }
    return result
  }, [filtered.edges, hoveredNodeId, selectedNodeId])
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined
  const selectedEdges = useMemo(
    () =>
      selectedNodeId
        ? filtered.edges
            .filter(
              (edge) =>
                edge.source === selectedNodeId ||
                edge.target === selectedNodeId,
            )
            .slice(0, 8)
        : [],
    [filtered.edges, selectedNodeId],
  )
  const searchResults = useMemo(() => {
    const clean = query.trim().toLowerCase()
    if (!clean) return []
    return filtered.nodes
      .filter(
        (node) =>
          node.username.toLowerCase().includes(clean) ||
          node.label.toLowerCase().includes(clean),
      )
      .slice(0, 8)
  }, [filtered.nodes, query])

  useEffect(() => {
    if (!containerRef.current) return
    const renderer = new Sigma(
      createGraph(filtered.nodes, filtered.edges, clusters),
      containerRef.current,
      {
        allowInvalidContainer: true,
        hideEdgesOnMove: true,
        hideLabelsOnMove: true,
        labelColor: {
          color: document.documentElement.classList.contains('dark')
            ? '#e4e4e7'
            : '#27272a',
        },
        labelDensity: 0.08,
        labelFont: 'var(--font-manrope), sans-serif',
        labelRenderedSizeThreshold: 7,
        labelSize: 12,
        minCameraRatio: 0.08,
        maxCameraRatio: 8,
        minEdgeThickness: 0.35,
        renderEdgeLabels: false,
        stagePadding: 35,
        zIndex: true,
      },
    )
    renderer.on('clickNode', ({ node }) => setSelectedNodeId(node))
    renderer.on('enterNode', ({ node }) => setHoveredNodeId(node))
    renderer.on('leaveNode', () => setHoveredNodeId(null))
    renderer.on('clickStage', () => setSelectedNodeId(null))
    rendererRef.current = renderer
    return () => {
      renderer.kill()
      rendererRef.current = null
    }
  }, [clusters, filtered.edges, filtered.nodes])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    const focus = hoveredNodeId || selectedNodeId
    renderer.setSetting('nodeReducer', (node, data) => {
      if (!focus || node === focus || neighborIds.has(node)) return data
      return { ...data, color: '#3f3f46', label: null, zIndex: 0 }
    })
    renderer.setSetting('edgeReducer', (edge, data) => {
      if (!focus) return data
      const graph = renderer.getGraph()
      const [source, target] = graph.extremities(edge)
      const visible = source === focus || target === focus
      return visible
        ? { ...data, color: 'rgba(42, 207, 128, 0.72)', zIndex: 1 }
        : { ...data, hidden: true }
    })
    renderer.refresh()
  }, [hoveredNodeId, neighborIds, selectedNodeId])

  useEffect(() => {
    if (
      selectedNodeId &&
      !filtered.nodes.some((node) => node.id === selectedNodeId)
    ) {
      setSelectedNodeId(null)
    }
  }, [filtered.nodes, selectedNodeId])

  const focusNode = (nodeId: string) => {
    const renderer = rendererRef.current
    const position = renderer?.getNodeDisplayData(nodeId)
    setSelectedNodeId(nodeId)
    setQuery('')
    if (renderer && position) {
      const camera = renderer.getCamera()
      camera.animate(
        {
          x: position.x,
          y: position.y,
          ratio: Math.max(0.12, camera.ratio / 2),
        },
        { duration: 350 },
      )
    }
  }

  const zoom = (factor: number) => {
    const camera = rendererRef.current?.getCamera()
    if (!camera) return
    camera.animate({
      ratio: Math.max(0.08, Math.min(8, camera.ratio * factor)),
    })
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-[4px] border border-zinc-200 bg-white p-4 dark:border-[#26262a] dark:bg-[#1b1b1e]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a member"
            aria-label="Find a member in the graph"
            className="h-9 w-full rounded-[3px] border border-zinc-200 bg-transparent pl-8 pr-8 text-[13px] outline-none focus:border-brand dark:border-[#35353a]"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-2 h-5 w-5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              aria-label="Clear member search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {searchResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-[3px] border border-zinc-200 bg-white shadow-xl dark:border-[#35353a] dark:bg-[#1b1b1e]">
              {searchResults.map((node) => (
                <button
                  key={node.id}
                  onClick={() => focusNode(node.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] hover:bg-zinc-100 dark:hover:bg-[#26262a]"
                >
                  <span className="truncate">@{node.username}</span>
                  <span className={MUTED}>{formatCount(node.followers)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Slider
          label="Minimum followers"
          value={followerSlider}
          displayValue={formatCount(minimumFollowers)}
          min={0}
          max={100}
          step={1}
          onChange={setFollowerSlider}
        />
        <Slider
          label="Mutual strength"
          value={minimumStrength}
          displayValue={`${minimumStrength.toFixed(2)} per 100`}
          min={0}
          max={Math.max(1, Math.ceil(snapshot.stats.maxStrength))}
          step={0.05}
          onChange={setMinimumStrength}
        />
        <Slider
          label="Maximum nodes"
          value={maximumNodes}
          displayValue={`${maximumNodes}`}
          min={Math.min(50, snapshot.stats.nodeCount)}
          max={snapshot.stats.nodeCount}
          step={10}
          onChange={setMaximumNodes}
        />

        <div className="grid grid-cols-2 gap-2 border-y border-zinc-200 py-3 text-[11px] dark:border-[#2b2b30]">
          <div>
            <div className={MUTED}>Visible</div>
            <div className="mt-0.5 font-semibold tabular-nums">
              {filtered.nodes.length} nodes
            </div>
          </div>
          <div>
            <div className={MUTED}>Structure</div>
            <div className="mt-0.5 font-semibold tabular-nums">
              {filtered.edges.length} edges
            </div>
          </div>
        </div>

        {filtered.omittedEdgesForPerformance > 0 && (
          <p className="rounded-[3px] border border-amber-500/25 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
            {formatCount(filtered.omittedEdgesForPerformance)} weaker edges are
            hidden to keep interaction smooth.
          </p>
        )}

        {selectedNode ? (
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2
                  className="truncate text-[17px] font-semibold"
                  style={SERIF}
                >
                  {selectedNode.label}
                </h2>
                <p className={`truncate text-[12px] ${MUTED}`}>
                  @{selectedNode.username} ·{' '}
                  {formatCount(selectedNode.followers)} followers
                </p>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                aria-label="Clear selected member"
                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {selectedEdges.length ? (
                selectedEdges.map((edge) => {
                  const neighbor = nodeById.get(
                    edge.source === selectedNode.id ? edge.target : edge.source,
                  )
                  if (!neighbor) return null
                  return (
                    <button
                      key={`${edge.source}:${edge.target}`}
                      onClick={() => focusNode(neighbor.id)}
                      className="flex w-full items-center justify-between gap-2 text-left text-[11px] hover:text-brand"
                    >
                      <span className="truncate">@{neighbor.username}</span>
                      <span className="tabular-nums text-zinc-500 dark:text-[#a7a7b4]">
                        {edge.strength.toFixed(2)} · {edge.mutualInteractions}×
                      </span>
                    </button>
                  )
                })
              ) : (
                <p className={`text-[11px] ${MUTED}`}>
                  No edges survive the current filters.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-[13px] font-semibold">Stable communities</h2>
            <div className="mt-2 max-h-44 space-y-1.5 overflow-auto pr-1">
              {snapshot.clusters.slice(0, 14).map((cluster) => (
                <div
                  key={cluster.id}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: cluster.color }}
                    />
                    <span className="truncate">{cluster.label}</span>
                  </span>
                  <span className={MUTED}>{cluster.nodeCount}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <details className={`text-[11px] leading-relaxed ${MUTED}`}>
          <summary className="cursor-pointer font-medium text-zinc-700 dark:text-[#d9d9de]">
            How strength works
          </summary>
          <p className="mt-2">
            For each direction, replies + quotes to this person are divided by
            all replies + quotes from that account, then multiplied by 100. The
            edge uses the weaker direction. Clusters and positions stay fixed as
            new members are fitted in.
          </p>
        </details>
      </aside>

      <section className="relative min-h-[560px] overflow-hidden rounded-[4px] border border-zinc-200 bg-[#f8faf9] dark:border-[#26262a] dark:bg-[#101112]">
        <div
          ref={containerRef}
          className="absolute inset-0"
          aria-label="Interactive social graph"
        />
        <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-[3px] border border-zinc-200 bg-white/90 shadow-sm backdrop-blur dark:border-[#35353a] dark:bg-[#1b1b1e]/90">
          <button
            onClick={() => zoom(0.72)}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-[#26262a]"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => zoom(1.4)}
            className="border-y border-zinc-200 p-2 hover:bg-zinc-100 dark:border-[#35353a] dark:hover:bg-[#26262a]"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={() => rendererRef.current?.getCamera().animatedReset()}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-[#26262a]"
            aria-label="Reset graph view"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-[3px] bg-white/80 px-2 py-1 text-[10px] text-zinc-500 backdrop-blur dark:bg-[#1b1b1e]/80 dark:text-[#a7a7b4]">
          Scroll to zoom · drag to pan · select a node to isolate its ties
        </div>
        {isPending && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-pulse bg-brand" />
        )}
      </section>
    </div>
  )
}
