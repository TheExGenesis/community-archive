'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { UndirectedGraph } from 'graphology'
import Sigma from 'sigma'
import type { NodeHoverDrawingFunction } from 'sigma/rendering'
import {
  Clock3,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useTheme } from 'next-themes'
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
import type {
  AdaptiveClusteringAlgorithm,
  AdaptiveGraphResult,
  AdaptiveLayoutAlgorithm,
} from '@/lib/socialGraphAdaptive'
import type {
  SocialGraphWorkerRequest,
  SocialGraphWorkerResponse,
} from '@/workers/socialGraph.worker'
import { nodeIdsForLabelCoverage, updateYearRange } from '@/lib/socialGraphView'
import { MUTED, SERIF } from '@/components/portal/styles'

interface NodeAttributes {
  label: string
  x: number
  y: number
  size: number
  color: string
  hidden?: boolean
  forceLabel?: boolean
  highlighted?: boolean
  showHover?: boolean
}

interface EdgeAttributes {
  size: number
  color: string
  strength: number
}

const DEFAULT_MAX_VISIBLE_NODES = 650
const DEFAULT_LABEL_PERCENTAGE = 20
const NODE_HOVER_DELAY_MS = 1_000
const STRENGTH_SLIDER_MAX = 3
const ADAPTIVE_PALETTE = [
  '#2acf80',
  '#60a5fa',
  '#f59e0b',
  '#f472b6',
  '#a78bfa',
  '#22d3ee',
  '#fb7185',
  '#84cc16',
  '#f97316',
  '#14b8a6',
  '#818cf8',
  '#e879f9',
]

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

function themeColors(isDark: boolean) {
  return isDark
    ? {
        label: '#f4f4f5',
        hoverBackground: 'rgba(24, 24, 27, 0.96)',
        hoverShadow: 'rgba(0, 0, 0, 0.65)',
      }
    : {
        label: '#18181b',
        hoverBackground: 'rgba(255, 255, 255, 0.97)',
        hoverShadow: 'rgba(24, 24, 27, 0.28)',
      }
}

function drawThemeNodeHover(
  isDark: boolean,
): NodeHoverDrawingFunction<NodeAttributes, EdgeAttributes> {
  return (context, data, settings) => {
    if (!data.showHover) return
    const colors = themeColors(isDark)
    const label = typeof data.label === 'string' ? data.label : ''
    const font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`
    context.save()
    context.font = font
    const textWidth = label ? context.measureText(label).width : 0
    const height = Math.max(data.size * 2 + 8, settings.labelSize + 12)
    const width = Math.max(height, data.size * 2 + textWidth + 18)
    const left = data.x - height / 2
    const top = data.y - height / 2
    context.fillStyle = colors.hoverBackground
    context.shadowBlur = 10
    context.shadowColor = colors.hoverShadow
    context.beginPath()
    context.roundRect(left, top, width, height, height / 2)
    context.fill()
    context.shadowBlur = 0
    context.beginPath()
    context.fillStyle = data.color
    context.arc(data.x, data.y, data.size, 0, Math.PI * 2)
    context.fill()
    if (label) {
      context.fillStyle = colors.label
      context.fillText(
        label,
        data.x + data.size + 6,
        data.y + settings.labelSize / 3,
      )
    }
    context.restore()
  }
}

function createGraph(
  nodes: SocialGraphNode[],
  edges: SocialGraphEdge[],
  clusters: Map<string, SocialGraphCluster>,
  adaptive?: AdaptiveGraphResult,
): UndirectedGraph<NodeAttributes, EdgeAttributes> {
  const graph = new UndirectedGraph<NodeAttributes, EdgeAttributes>()
  for (const node of nodes) {
    graph.addNode(node.id, {
      label: node.label || `@${node.username}`,
      x: adaptive?.positions[node.id]?.x ?? node.x,
      y: adaptive?.positions[node.id]?.y ?? node.y,
      size: nodeSize(node.followers),
      color: adaptive
        ? adaptive.communities[node.id] >= 0
          ? ADAPTIVE_PALETTE[
              adaptive.communities[node.id] % ADAPTIVE_PALETTE.length
            ]
          : '#71717a'
        : clusters.get(node.cluster)?.color || '#71717a',
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

function DualRangeSlider({
  label,
  startValue,
  endValue,
  min,
  max,
  onChange,
}: {
  label: string
  startValue: number
  endValue: number
  min: number
  max: number
  onChange: (startValue: number, endValue: number) => void
}) {
  const span = Math.max(1, max - min)
  const startPosition = (100 * (startValue - min)) / span
  const endPosition = (100 * (endValue - min)) / span

  return (
    <fieldset>
      <legend className="mb-1.5 flex w-full items-center justify-between gap-3 text-[12px] font-medium">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-500 dark:text-[#a7a7b4]">
          {startValue}–{endValue}
        </span>
      </legend>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-[9px] h-1.5 rounded-full bg-zinc-200 dark:bg-[#35353a]">
          <div
            className="absolute h-full rounded-full bg-emerald-500"
            style={{
              left: `${startPosition}%`,
              width: `${endPosition - startPosition}%`,
            }}
          />
        </div>
        <input
          type="range"
          aria-label="Interaction start year"
          min={min}
          max={max}
          step={1}
          value={startValue}
          onChange={(event) => {
            const [nextStart, nextEnd] = updateYearRange(
              startValue,
              endValue,
              'start',
              Number(event.target.value),
            )
            onChange(nextStart, nextEnd)
          }}
          className="dual-range-input absolute inset-x-0 top-0 z-20 h-6 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          aria-label="Interaction end year"
          min={min}
          max={max}
          step={1}
          value={endValue}
          onChange={(event) => {
            const [nextStart, nextEnd] = updateYearRange(
              startValue,
              endValue,
              'end',
              Number(event.target.value),
            )
            onChange(nextStart, nextEnd)
          }}
          className="dual-range-input absolute inset-x-0 top-0 z-10 h-6 w-full appearance-none bg-transparent"
        />
      </div>
      <div className={`flex justify-between text-[10px] ${MUTED}`}>
        <span>{min}</span>
        <span>Inclusive UTC years</span>
        <span>{max}</span>
      </div>
      <style jsx>{`
        .dual-range-input {
          pointer-events: none;
        }
        .dual-range-input::-webkit-slider-runnable-track {
          height: 6px;
          background: transparent;
        }
        .dual-range-input::-webkit-slider-thumb {
          width: 16px;
          height: 16px;
          margin-top: -5px;
          cursor: grab;
          pointer-events: auto;
          appearance: none;
          border: 2px solid white;
          border-radius: 9999px;
          background: #10b981;
          box-shadow: 0 0 0 1px rgba(24, 24, 27, 0.22);
        }
        .dual-range-input::-moz-range-track {
          height: 6px;
          background: transparent;
        }
        .dual-range-input::-moz-range-thumb {
          width: 12px;
          height: 12px;
          cursor: grab;
          pointer-events: auto;
          border: 2px solid white;
          border-radius: 9999px;
          background: #10b981;
          box-shadow: 0 0 0 1px rgba(24, 24, 27, 0.22);
        }
      `}</style>
    </fieldset>
  )
}

export default function SocialGraphExplorer({
  snapshot,
}: {
  snapshot: SocialGraphSnapshot
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<Sigma<NodeAttributes, EdgeAttributes> | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const workerRequestRef = useRef(0)
  const workerSignatureRef = useRef('')
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverCandidateRef = useRef<string | null>(null)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(
    null,
  )
  const [query, setQuery] = useState('')
  const [labelPercentage, setLabelPercentage] = useState(
    DEFAULT_LABEL_PERCENTAGE,
  )
  const [followerSlider, setFollowerSlider] = useState(0)
  const [startYear, setStartYear] = useState(snapshot.temporal.minYear)
  const [endYear, setEndYear] = useState(snapshot.temporal.maxYear)
  const [minimumStrength, setMinimumStrength] = useState(
    Math.min(
      STRENGTH_SLIDER_MAX,
      Math.round(snapshot.stats.suggestedMinStrength / 0.05) * 0.05,
    ),
  )
  const [maximumNodes, setMaximumNodes] = useState(
    Math.min(DEFAULT_MAX_VISIBLE_NODES, snapshot.stats.nodeCount),
  )
  const [clusteringAlgorithm, setClusteringAlgorithm] =
    useState<AdaptiveClusteringAlgorithm>('louvain')
  const [layoutAlgorithm, setLayoutAlgorithm] =
    useState<AdaptiveLayoutAlgorithm>('clustered-force')
  const [adaptiveResult, setAdaptiveResult] =
    useState<AdaptiveGraphResult | null>(null)
  const [adaptiveSignature, setAdaptiveSignature] = useState<string | null>(
    null,
  )
  const [isAdapting, setIsAdapting] = useState(false)
  const [adaptiveError, setAdaptiveError] = useState<string | null>(null)
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
        startYear,
        endYear,
      }),
    [
      snapshot,
      appliedMinimumFollowers,
      deferredMinimumStrength,
      deferredMaximumNodes,
      endYear,
      startYear,
    ],
  )
  const filteredSignature = useMemo(
    () =>
      `${filtered.nodes.map((node) => node.id).join(',')}|${filtered.edges.map((edge) => `${edge.source}:${edge.target}:${edge.strength}`).join(',')}`,
    [filtered.edges, filtered.nodes],
  )
  const adaptiveRunSignature = `${filteredSignature}|${clusteringAlgorithm}|${layoutAlgorithm}`
  const adaptiveIsCurrent = adaptiveSignature === adaptiveRunSignature
  const adaptiveLegendClusters = useMemo(() => {
    if (!adaptiveResult) return []
    const counts = new Map<number, number>()
    Object.values(adaptiveResult.communities).forEach((community) => {
      counts.set(community, (counts.get(community) || 0) + 1)
    })
    const connected = Array.from(
      { length: adaptiveResult.communityCount },
      (_, index) => ({
        id: `adaptive-${index}`,
        label: `Active community ${index + 1}`,
        color: ADAPTIVE_PALETTE[index % ADAPTIVE_PALETTE.length],
        nodeCount: counts.get(index) || 0,
      }),
    )
    const isolateCount = counts.get(-1) || 0
    return isolateCount
      ? [
          ...connected,
          {
            id: 'adaptive-unconnected',
            label: 'Unconnected at this threshold',
            color: '#71717a',
            nodeCount: isolateCount,
          },
        ]
      : connected
  }, [adaptiveResult])
  const activeLegendClusters = useMemo(
    () =>
      adaptiveIsCurrent && adaptiveResult
        ? adaptiveLegendClusters
        : snapshot.clusters,
    [
      adaptiveIsCurrent,
      adaptiveLegendClusters,
      adaptiveResult,
      snapshot.clusters,
    ],
  )
  const communityByNode = useMemo(() => {
    const result = new Map<string, string>()
    for (const node of filtered.nodes) {
      if (adaptiveIsCurrent && adaptiveResult) {
        const community = adaptiveResult.communities[node.id] ?? -1
        result.set(
          node.id,
          community >= 0 ? `adaptive-${community}` : 'adaptive-unconnected',
        )
      } else {
        result.set(node.id, node.cluster)
      }
    }
    return result
  }, [adaptiveIsCurrent, adaptiveResult, filtered.nodes])
  const communityColorByNode = useMemo(() => {
    const colors = new Map(
      activeLegendClusters.map((community) => [community.id, community.color]),
    )
    return new Map(
      filtered.nodes.map((node) => [
        node.id,
        colors.get(communityByNode.get(node.id) || '') || '#71717a',
      ]),
    )
  }, [activeLegendClusters, communityByNode, filtered.nodes])
  const selectedCommunityNodeIds = useMemo(
    () =>
      new Set(
        selectedCommunityId
          ? filtered.nodes
              .filter(
                (node) => communityByNode.get(node.id) === selectedCommunityId,
              )
              .map((node) => node.id)
          : [],
      ),
    [communityByNode, filtered.nodes, selectedCommunityId],
  )
  const labeledNodeIds = useMemo(
    () =>
      nodeIdsForLabelCoverage(
        filtered.nodes,
        labelPercentage,
        communityByNode,
        selectedCommunityId,
      ),
    [communityByNode, filtered.nodes, labelPercentage, selectedCommunityId],
  )
  const selectedCommunity = selectedCommunityId
    ? activeLegendClusters.find(
        (community) => community.id === selectedCommunityId,
      )
    : undefined
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
    const colors = themeColors(isDark)
    const renderer = new Sigma<NodeAttributes, EdgeAttributes>(
      createGraph(
        filtered.nodes,
        filtered.edges,
        clusters,
        adaptiveIsCurrent ? adaptiveResult || undefined : undefined,
      ),
      containerRef.current,
      {
        allowInvalidContainer: true,
        hideEdgesOnMove: true,
        hideLabelsOnMove: true,
        labelColor: {
          color: colors.label,
        },
        defaultDrawNodeHover: drawThemeNodeHover(isDark),
        labelDensity: 0.01,
        labelFont: 'var(--font-manrope), sans-serif',
        labelRenderedSizeThreshold: 10_000,
        labelSize: 12,
        minCameraRatio: 0.08,
        maxCameraRatio: 8,
        minEdgeThickness: 0.35,
        renderEdgeLabels: false,
        stagePadding: 35,
        zIndex: true,
      },
    )
    renderer.on('clickNode', ({ node }) => {
      setSelectedNodeId(node)
      setHoveredNodeId(null)
    })
    renderer.on('enterNode', ({ node }) => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      hoverCandidateRef.current = node
      hoverTimerRef.current = setTimeout(() => {
        if (hoverCandidateRef.current === node) setHoveredNodeId(node)
      }, NODE_HOVER_DELAY_MS)
    })
    renderer.on('leaveNode', ({ node }) => {
      if (hoverCandidateRef.current === node) {
        hoverCandidateRef.current = null
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
      setHoveredNodeId((current) => (current === node ? null : current))
    })
    renderer.on('clickStage', () => setSelectedNodeId(null))
    rendererRef.current = renderer
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
      hoverCandidateRef.current = null
      renderer.kill()
      rendererRef.current = null
    }
  }, [
    adaptiveIsCurrent,
    adaptiveResult,
    clusters,
    filtered.edges,
    filtered.nodes,
    isDark,
  ])

  useEffect(() => {
    const worker = new Worker(
      new URL('../../workers/socialGraph.worker.ts', import.meta.url),
    )
    workerRef.current = worker
    worker.addEventListener(
      'message',
      (event: MessageEvent<SocialGraphWorkerResponse>) => {
        if (event.data.id !== workerRequestRef.current) return
        setIsAdapting(false)
        if (event.data.error || !event.data.result) {
          setAdaptiveError(event.data.error || 'Adaptive graph failed')
          return
        }
        setAdaptiveResult(event.data.result)
        setAdaptiveSignature(workerSignatureRef.current)
        setAdaptiveError(null)
      },
    )
    worker.addEventListener('error', () => {
      setIsAdapting(false)
      setAdaptiveError('Adaptive graph worker failed')
    })
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    const focus = hoveredNodeId || selectedNodeId
    renderer.setSetting('nodeReducer', (node, data) => {
      const isFocusNode = !focus || node === focus || neighborIds.has(node)
      const isCommunityNode =
        !selectedCommunityId || selectedCommunityNodeIds.has(node)
      const showHover = node === focus
      const forceLabel = labeledNodeIds.has(node)

      if (!isFocusNode || (!isCommunityNode && !focus)) {
        return {
          ...data,
          color: isDark ? '#3f3f46' : '#d4d4d8',
          forceLabel: false,
          highlighted: false,
          label: null,
          showHover: false,
          zIndex: 0,
        }
      }

      return {
        ...data,
        forceLabel,
        highlighted: showHover,
        showHover,
        size:
          selectedCommunityId && isCommunityNode ? data.size * 1.12 : data.size,
        zIndex:
          showHover || (Boolean(selectedCommunityId) && isCommunityNode)
            ? 1
            : 0,
      }
    })
    renderer.setSetting('edgeReducer', (edge, data) => {
      const graph = renderer.getGraph()
      const [source, target] = graph.extremities(edge)
      if (focus) {
        const visible = source === focus || target === focus
        return visible
          ? { ...data, color: 'rgba(42, 207, 128, 0.72)', zIndex: 1 }
          : { ...data, hidden: true }
      }
      if (selectedCommunityId) {
        const internal =
          selectedCommunityNodeIds.has(source) &&
          selectedCommunityNodeIds.has(target)
        return internal
          ? {
              ...data,
              color: `${selectedCommunity?.color || '#2acf80'}80`,
              zIndex: 1,
            }
          : { ...data, hidden: true }
      }
      return data
    })
    renderer.refresh()
  }, [
    hoveredNodeId,
    isDark,
    labeledNodeIds,
    neighborIds,
    selectedCommunity,
    selectedCommunityId,
    selectedCommunityNodeIds,
    selectedNodeId,
  ])

  useEffect(() => {
    if (
      selectedCommunityId &&
      !activeLegendClusters.some(
        (community) => community.id === selectedCommunityId,
      )
    ) {
      setSelectedCommunityId(null)
    }
  }, [activeLegendClusters, selectedCommunityId])

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

  const toggleCommunity = (communityId: string) => {
    const isClearing = selectedCommunityId === communityId
    setSelectedCommunityId(isClearing ? null : communityId)
    setSelectedNodeId(null)
    setHoveredNodeId(null)
    hoverCandidateRef.current = null
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
  }

  const zoom = (factor: number) => {
    const camera = rendererRef.current?.getCamera()
    if (!camera) return
    camera.animate({
      ratio: Math.max(0.08, Math.min(8, camera.ratio * factor)),
    })
  }

  const adaptGraph = () => {
    const worker = workerRef.current
    if (!worker) return
    const id = workerRequestRef.current + 1
    workerRequestRef.current = id
    workerSignatureRef.current = adaptiveRunSignature
    setIsAdapting(true)
    setAdaptiveError(null)
    const request: SocialGraphWorkerRequest = {
      id,
      nodes: filtered.nodes,
      edges: filtered.edges,
      options: {
        clustering: clusteringAlgorithm,
        layout: layoutAlgorithm,
      },
    }
    worker.postMessage(request)
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
        <DualRangeSlider
          label="Interaction years"
          startValue={startYear}
          endValue={endYear}
          min={snapshot.temporal.minYear}
          max={snapshot.temporal.maxYear}
          onChange={(nextStartYear, nextEndYear) => {
            setStartYear(nextStartYear)
            setEndYear(nextEndYear)
          }}
        />
        <Slider
          label="Mutual strength"
          value={minimumStrength}
          displayValue={`${minimumStrength.toFixed(2)} per 100`}
          min={0}
          max={STRENGTH_SLIDER_MAX}
          step={0.05}
          onChange={setMinimumStrength}
        />
        <Slider
          label="Maximum nodes (centrality)"
          value={maximumNodes}
          displayValue={`${maximumNodes}`}
          min={Math.min(50, snapshot.stats.nodeCount)}
          max={snapshot.stats.nodeCount}
          step={10}
          onChange={setMaximumNodes}
        />

        <details className="rounded-[3px] border border-zinc-200 dark:border-[#35353a]">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-[12px] font-semibold [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="h-3.5 w-3.5 text-brand" />
            Advanced options
          </summary>
          <div className="space-y-4 border-t border-zinc-200 p-3 dark:border-[#35353a]">
            <div>
              <Slider
                label="Names shown"
                value={labelPercentage}
                displayValue={`${labelPercentage}%`}
                min={0}
                max={100}
                step={5}
                onChange={setLabelPercentage}
              />
              <p className={`mt-1.5 text-[10px] leading-relaxed ${MUTED}`}>
                Uses centrality order. A selected community always shows all of
                its visible names.
              </p>
            </div>

            <div className="space-y-2.5 border-t border-zinc-200 pt-3 dark:border-[#35353a]">
              <div>
                <h2 className="text-[12px] font-semibold">
                  Adaptive structure
                </h2>
                <p className={`mt-1 text-[10px] leading-relaxed ${MUTED}`}>
                  Recluster and lay out only the graph that survives these
                  filters.
                </p>
              </div>
              <label className="block text-[11px]">
                <span className="mb-1 block font-medium">Clustering</span>
                <select
                  aria-label="Adaptive clustering algorithm"
                  value={clusteringAlgorithm}
                  onChange={(event) =>
                    setClusteringAlgorithm(
                      event.target.value as AdaptiveClusteringAlgorithm,
                    )
                  }
                  className="h-8 w-full rounded-[3px] border border-zinc-200 bg-white px-2 dark:border-[#35353a] dark:bg-[#151517]"
                >
                  <option value="louvain">Louvain</option>
                  <option value="label-propagation">Label propagation</option>
                </select>
              </label>
              <label className="block text-[11px]">
                <span className="mb-1 block font-medium">Layout</span>
                <select
                  aria-label="Adaptive layout algorithm"
                  value={layoutAlgorithm}
                  onChange={(event) =>
                    setLayoutAlgorithm(
                      event.target.value as AdaptiveLayoutAlgorithm,
                    )
                  }
                  className="h-8 w-full rounded-[3px] border border-zinc-200 bg-white px-2 dark:border-[#35353a] dark:bg-[#151517]"
                >
                  <option value="clustered-force">
                    Community force-directed
                  </option>
                  <option value="force-directed">Force-directed</option>
                </select>
              </label>
              <button
                type="button"
                onClick={adaptGraph}
                disabled={isAdapting || filtered.nodes.length < 2}
                className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[3px] bg-brand px-3 text-[11px] font-semibold text-zinc-950 disabled:cursor-wait disabled:opacity-60"
              >
                {isAdapting ? (
                  <Clock3 className="h-3.5 w-3.5 animate-pulse" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {isAdapting ? 'Calculating…' : 'Recluster & relayout'}
              </button>
              {adaptiveResult && (
                <div className={`text-[10px] leading-relaxed ${MUTED}`}>
                  <p>
                    {adaptiveResult.communityCount} communities · modularity{' '}
                    {adaptiveResult.modularity.toFixed(3)}
                  </p>
                  <p className="tabular-nums">
                    Cluster {adaptiveResult.clusterMs.toFixed(1)} ms · layout{' '}
                    {adaptiveResult.layoutMs.toFixed(1)} ms · total{' '}
                    {adaptiveResult.totalMs.toFixed(1)} ms
                  </p>
                  {!adaptiveIsCurrent && (
                    <p className="mt-1 text-amber-700 dark:text-amber-300">
                      Filters changed; rerun to adapt this graph.
                    </p>
                  )}
                </div>
              )}
              {adaptiveError && (
                <p className="text-[10px] text-red-600 dark:text-red-400">
                  {adaptiveError}
                </p>
              )}
            </div>
          </div>
        </details>

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

        {selectedNode && (
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
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                          style={{
                            backgroundColor:
                              communityColorByNode.get(neighbor.id) ||
                              '#71717a',
                          }}
                          aria-hidden="true"
                        />
                        <span className="truncate">@{neighbor.username}</span>
                      </span>
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
        )}

        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold">
              {adaptiveIsCurrent ? 'Active communities' : 'Stable communities'}
            </h2>
            {selectedCommunity && (
              <button
                type="button"
                onClick={() => toggleCommunity(selectedCommunity.id)}
                className="text-[10px] text-zinc-500 hover:text-zinc-900 dark:text-[#a7a7b4] dark:hover:text-white"
              >
                Show all
              </button>
            )}
          </div>
          {selectedCommunity && (
            <p className={`mt-1 text-[10px] leading-relaxed ${MUTED}`}>
              Highlighting {selectedCommunity.label}; all visible names in this
              community are shown.
            </p>
          )}
          <div
            className="mt-2 max-h-44 space-y-1 overflow-auto pr-1"
            tabIndex={0}
            aria-label="Community list"
          >
            {activeLegendClusters.slice(0, 14).map((cluster) => {
              const isSelected = selectedCommunityId === cluster.id
              return (
                <button
                  type="button"
                  key={cluster.id}
                  aria-pressed={isSelected}
                  onClick={() => toggleCommunity(cluster.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-[3px] px-1.5 py-1 text-left text-[11px] transition-colors ${
                    isSelected
                      ? 'bg-zinc-100 font-medium dark:bg-[#2b2b30]'
                      : 'hover:bg-zinc-50 dark:hover:bg-[#242428]'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: cluster.color }}
                    />
                    <span className="truncate">{cluster.label}</span>
                  </span>
                  <span className={MUTED}>{cluster.nodeCount}</span>
                </button>
              )
            })}
          </div>
        </div>

        <details className={`text-[11px] leading-relaxed ${MUTED}`}>
          <summary className="cursor-pointer font-medium text-zinc-700 dark:text-[#d9d9de]">
            How strength works
          </summary>
          <p className="mt-2">
            For each direction, replies + quotes to this person are divided by
            all replies + quotes from that account, then multiplied by 100. The
            edge uses the weaker direction. Counts and denominators are
            recomputed for the selected years. The node limit keeps the highest
            weighted-degree accounts in that active graph. The stable server
            layout stays fixed until you explicitly run an adaptive layout.
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
          Scroll to zoom · drag to pan · click or hover 1s to inspect a node
        </div>
        {isPending && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-pulse bg-brand" />
        )}
      </section>
    </div>
  )
}
