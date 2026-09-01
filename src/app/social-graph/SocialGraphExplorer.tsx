'use client'

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { UndirectedGraph } from 'graphology'
import Sigma from 'sigma'
import type { NodeHoverDrawingFunction } from 'sigma/rendering'
import {
  Clock3,
  LocateFixed,
  Minus,
  Network,
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
  followerCountToSlider,
  followerSliderToCount,
  pinNodeInFilteredGraph,
} from '@/lib/socialGraphFilter'
import type { AdaptiveGraphResult } from '@/lib/socialGraphAdaptive'
import { alignGraphLayout } from '@/lib/socialGraphProcrustes'
import type {
  SocialGraphWorkerRequest,
  SocialGraphWorkerResponse,
} from '@/workers/socialGraph.worker'
import {
  communityDisplayLabel,
  getSocialGraphDefaultSettings,
  labelSettingsForDensity,
  nodeIdsForOverviewLabels,
  SOCIAL_GRAPH_DEFAULTS,
  updateYearRange,
} from '@/lib/socialGraphView'
import { MUTED } from '@/components/portal/styles'
import { SocialGraphDetails, type DisplayCommunity } from './SocialGraphDetails'

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

const NODE_HOVER_DELAY_MS = 200
const STRENGTH_SLIDER_MAX = 3
const EMPTY_CURRENT_MEMBER = { accountId: null, username: null }
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

function nodeSize(visibleStrength: number): number {
  return Math.max(2.8, Math.min(11, 2.8 + Math.log1p(visibleStrength) * 1.65))
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
  const visibleStrength = new Map(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) {
    visibleStrength.set(
      edge.source,
      (visibleStrength.get(edge.source) || 0) + edge.strength,
    )
    visibleStrength.set(
      edge.target,
      (visibleStrength.get(edge.target) || 0) + edge.strength,
    )
  }
  for (const node of nodes) {
    graph.addNode(node.id, {
      label: node.label || `@${node.username}`,
      x: adaptive?.positions[node.id]?.x ?? node.x,
      y: adaptive?.positions[node.id]?.y ?? node.y,
      size: nodeSize(visibleStrength.get(node.id) || 0),
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
      color: 'rgba(100, 116, 139, 0.32)',
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
  const trackRef = useRef<HTMLDivElement>(null)
  const span = Math.max(1, max - min)
  const startPosition = (100 * (startValue - min)) / span
  const endPosition = (100 * (endValue - min)) / span
  const setHandleFromClientX = (handle: 'start' | 'end', clientX: number) => {
    const bounds = trackRef.current?.getBoundingClientRect()
    if (!bounds?.width) return
    const ratio = Math.max(
      0,
      Math.min(1, (clientX - bounds.left) / bounds.width),
    )
    const nextYear = Math.round(min + ratio * span)
    const [nextStart, nextEnd] = updateYearRange(
      startValue,
      endValue,
      handle,
      nextYear,
    )
    onChange(nextStart, nextEnd)
  }
  const moveHandleByKey = (handle: 'start' | 'end', key: string) => {
    const current = handle === 'start' ? startValue : endValue
    const next =
      key === 'Home'
        ? min
        : key === 'End'
          ? max
          : key === 'ArrowLeft' || key === 'ArrowDown'
            ? current - 1
            : key === 'ArrowRight' || key === 'ArrowUp'
              ? current + 1
              : null
    if (next === null) return false
    const [nextStart, nextEnd] = updateYearRange(
      startValue,
      endValue,
      handle,
      Math.max(min, Math.min(max, next)),
    )
    onChange(nextStart, nextEnd)
    return true
  }

  const handleProps = (handle: 'start' | 'end', value: number) => ({
    'aria-label':
      handle === 'start' ? 'Interaction start year' : 'Interaction end year',
    'aria-valuemax': max,
    'aria-valuemin': min,
    'aria-valuenow': value,
    'aria-valuetext': String(value),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (moveHandleByKey(handle, event.key)) event.preventDefault()
    },
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      setHandleFromClientX(handle, event.clientX)
    },
    onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        setHandleFromClientX(handle, event.clientX)
      }
    },
    role: 'slider',
  })

  return (
    <fieldset>
      <legend className="mb-1.5 flex w-full items-center justify-between gap-3 text-[12px] font-medium">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-500 dark:text-[#a7a7b4]">
          {startValue}–{endValue}
        </span>
      </legend>
      <div
        ref={trackRef}
        className="relative h-6 touch-none"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return
          const bounds = trackRef.current?.getBoundingClientRect()
          if (!bounds?.width) return
          const clickedYear = Math.round(
            min +
              Math.max(
                0,
                Math.min(1, (event.clientX - bounds.left) / bounds.width),
              ) *
                span,
          )
          const handle =
            Math.abs(clickedYear - startValue) <=
            Math.abs(clickedYear - endValue)
              ? 'start'
              : 'end'
          setHandleFromClientX(handle, event.clientX)
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-[9px] h-1.5 rounded-full bg-zinc-200 dark:bg-[#35353a]">
          <div
            className="absolute h-full rounded-full bg-emerald-500"
            style={{
              left: `${startPosition}%`,
              width: `${endPosition - startPosition}%`,
            }}
          />
        </div>
        <button
          type="button"
          {...handleProps('start', startValue)}
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-emerald-500 shadow-[0_0_0_1px_rgba(24,24,27,0.22)] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 active:cursor-grabbing dark:focus:ring-offset-[#1b1b1e]"
          style={{
            left: `${startPosition}%`,
            zIndex: startValue === endValue && startValue === max ? 30 : 20,
          }}
        />
        <button
          type="button"
          {...handleProps('end', endValue)}
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-emerald-500 shadow-[0_0_0_1px_rgba(24,24,27,0.22)] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 active:cursor-grabbing dark:focus:ring-offset-[#1b1b1e]"
          style={{ left: `${endPosition}%`, zIndex: 25 }}
        />
      </div>
      <div className={`flex justify-between text-[10px] ${MUTED}`}>
        <span>{min}</span>
        <span>Inclusive UTC years</span>
        <span>{max}</span>
      </div>
    </fieldset>
  )
}

export default function SocialGraphExplorer({
  snapshot,
  currentMember = EMPTY_CURRENT_MEMBER,
}: {
  snapshot: SocialGraphSnapshot
  currentMember?: {
    accountId: string | null
    username: string | null
  }
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<Sigma<NodeAttributes, EdgeAttributes> | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const workerRequestRef = useRef(0)
  const workerSignatureRef = useRef('')
  const completedPresetRecalculationRef = useRef(0)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverCandidateRef = useRef<string | null>(null)
  const layoutReferenceRef = useRef(
    Object.fromEntries(
      snapshot.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
    ),
  )
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'
  const defaultSettings = useMemo(
    () =>
      getSocialGraphDefaultSettings({
        minYear: snapshot.temporal.minYear,
        maxYear: snapshot.temporal.maxYear,
        maxFollowers: snapshot.stats.maxFollowers,
        nodeCount: snapshot.stats.nodeCount,
      }),
    [snapshot.stats, snapshot.temporal],
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [focusHistory, setFocusHistory] = useState<string[]>([])
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(
    null,
  )
  const [query, setQuery] = useState('')
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null)
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(
    null,
  )
  const [labelPercentage, setLabelPercentage] = useState<number>(
    defaultSettings.labelPercentage,
  )
  const [minimumFollowers, setMinimumFollowers] = useState(
    defaultSettings.minimumFollowers,
  )
  const [startYear, setStartYear] = useState(defaultSettings.startYear)
  const [endYear, setEndYear] = useState(defaultSettings.endYear)
  const [minimumStrength, setMinimumStrength] = useState<number>(
    defaultSettings.minimumStrength,
  )
  const [maximumNodes, setMaximumNodes] = useState(defaultSettings.maximumNodes)
  const [adaptiveResult, setAdaptiveResult] =
    useState<AdaptiveGraphResult | null>(null)
  const [adaptiveSignature, setAdaptiveSignature] = useState<string | null>(
    null,
  )
  const [isAdapting, setIsAdapting] = useState(false)
  const [adaptiveError, setAdaptiveError] = useState<string | null>(null)
  const [presetRecalculationRequest, setPresetRecalculationRequest] =
    useState(0)
  const deferredMinimumFollowers = useDeferredValue(minimumFollowers)
  const deferredMinimumStrength = useDeferredValue(minimumStrength)
  const deferredMaximumNodes = useDeferredValue(maximumNodes)
  const followerSlider = followerCountToSlider(
    minimumFollowers,
    snapshot.stats.maxFollowers,
  )
  const isPending =
    deferredMinimumFollowers !== minimumFollowers ||
    deferredMinimumStrength !== minimumStrength ||
    deferredMaximumNodes !== maximumNodes
  const clusters = useMemo(() => clusterMap(snapshot.clusters), [snapshot])
  const nodeById = useMemo(
    () => new Map(snapshot.nodes.map((node) => [node.id, node])),
    [snapshot.nodes],
  )
  const currentFilters = useMemo(
    () => ({
      minimumFollowers: deferredMinimumFollowers,
      minimumStrength: deferredMinimumStrength,
      maximumNodes: deferredMaximumNodes,
      startYear,
      endYear,
    }),
    [
      deferredMaximumNodes,
      deferredMinimumFollowers,
      deferredMinimumStrength,
      endYear,
      startYear,
    ],
  )
  const baseFiltered = useMemo(
    () => filterSocialGraph(snapshot, currentFilters),
    [snapshot, currentFilters],
  )
  const filtered = useMemo(
    () =>
      pinNodeInFilteredGraph(
        snapshot,
        baseFiltered,
        pinnedNodeId,
        currentFilters,
      ),
    [baseFiltered, currentFilters, pinnedNodeId, snapshot],
  )
  const baseVisibleNodeIds = useMemo(
    () => new Set(baseFiltered.nodes.map((node) => node.id)),
    [baseFiltered.nodes],
  )
  const currentMemberNode = useMemo(() => {
    const username = currentMember.username?.toLowerCase()
    return snapshot.nodes.find(
      (node) =>
        (currentMember.accountId !== null &&
          node.accountId === currentMember.accountId) ||
        (username !== undefined && node.username.toLowerCase() === username),
    )
  }, [currentMember, snapshot.nodes])
  const filteredSignature = useMemo(
    () =>
      `${filtered.nodes.map((node) => node.id).join(',')}|${filtered.edges.map((edge) => `${edge.source}:${edge.target}:${edge.strength}`).join(',')}`,
    [filtered.edges, filtered.nodes],
  )
  const adaptiveRunSignature = `${filteredSignature}|${SOCIAL_GRAPH_DEFAULTS.clustering}|${SOCIAL_GRAPH_DEFAULTS.layout}`
  const adaptiveInputRef = useRef({
    signature: adaptiveRunSignature,
    nodes: filtered.nodes,
    edges: filtered.edges,
  })
  adaptiveInputRef.current = {
    signature: adaptiveRunSignature,
    nodes: filtered.nodes,
    edges: filtered.edges,
  }
  const requestAdaptiveGraph = useCallback((workerOverride?: Worker) => {
    const worker = workerOverride ?? workerRef.current
    const input = adaptiveInputRef.current
    if (!worker || input.nodes.length < 2) return
    const id = workerRequestRef.current + 1
    workerRequestRef.current = id
    workerSignatureRef.current = input.signature
    setIsAdapting(true)
    setAdaptiveError(null)
    const request: SocialGraphWorkerRequest = {
      id,
      nodes: input.nodes,
      edges: input.edges,
      options: {
        clustering: SOCIAL_GRAPH_DEFAULTS.clustering,
        layout: SOCIAL_GRAPH_DEFAULTS.layout,
      },
    }
    worker.postMessage(request)
  }, [])
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
  const displayCommunities = useMemo<DisplayCommunity[]>(
    () =>
      activeLegendClusters.flatMap((community) => {
        const members = filtered.nodes.filter(
          (node) => communityByNode.get(node.id) === community.id,
        )
        if (!members.length) return []
        const unconnected = community.id.includes('unconnected')
        return [
          {
            ...community,
            label: communityDisplayLabel(members, unconnected),
            nodeCount: members.length,
          },
        ]
      }),
    [activeLegendClusters, communityByNode, filtered.nodes],
  )
  const communityColorByNode = useMemo(() => {
    const colors = new Map(
      displayCommunities.map((community) => [community.id, community.color]),
    )
    return new Map(
      filtered.nodes.map((node) => [
        node.id,
        colors.get(communityByNode.get(node.id) || '') || '#71717a',
      ]),
    )
  }, [communityByNode, displayCommunities, filtered.nodes])
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
      nodeIdsForOverviewLabels(
        filtered.nodes,
        communityByNode,
        Math.max(4, Math.round(8 + labelPercentage / 2)),
        2,
      ),
    [communityByNode, filtered.nodes, labelPercentage],
  )
  const selectedCommunity = selectedCommunityId
    ? displayCommunities.find(
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
        ? filtered.edges.filter(
            (edge) =>
              edge.source === selectedNodeId || edge.target === selectedNodeId,
          )
        : [],
    [filtered.edges, selectedNodeId],
  )
  const selectedNodeCommunity = selectedNodeId
    ? displayCommunities.find(
        (community) => community.id === communityByNode.get(selectedNodeId),
      )
    : undefined
  const selectedCommunityMembers = useMemo(
    () =>
      selectedCommunityId
        ? filtered.nodes.filter(
            (node) => communityByNode.get(node.id) === selectedCommunityId,
          )
        : [],
    [communityByNode, filtered.nodes, selectedCommunityId],
  )
  const selectedCommunityInternalEdges = useMemo(
    () =>
      selectedCommunityId
        ? filtered.edges.filter(
            (edge) =>
              selectedCommunityNodeIds.has(edge.source) &&
              selectedCommunityNodeIds.has(edge.target),
          )
        : [],
    [filtered.edges, selectedCommunityId, selectedCommunityNodeIds],
  )
  const selectedCommunityBridges = useMemo(() => {
    if (!selectedCommunityId) return []
    const strengthByNode = new Map<string, number>()
    for (const edge of filtered.edges) {
      const sourceInside = selectedCommunityNodeIds.has(edge.source)
      const targetInside = selectedCommunityNodeIds.has(edge.target)
      if (sourceInside === targetInside) continue
      const insideNode = sourceInside ? edge.source : edge.target
      strengthByNode.set(
        insideNode,
        (strengthByNode.get(insideNode) || 0) + edge.strength,
      )
    }
    return Array.from(strengthByNode)
      .map(([nodeId, externalStrength]) => ({
        node: nodeById.get(nodeId),
        externalStrength,
      }))
      .filter(
        (entry): entry is { node: SocialGraphNode; externalStrength: number } =>
          Boolean(entry.node),
      )
      .sort((left, right) => right.externalStrength - left.externalStrength)
  }, [filtered.edges, nodeById, selectedCommunityId, selectedCommunityNodeIds])
  const isolatedNodeCount = useMemo(() => {
    const connected = new Set<string>()
    for (const edge of filtered.edges) {
      connected.add(edge.source)
      connected.add(edge.target)
    }
    return filtered.nodes.filter((node) => !connected.has(node.id)).length
  }, [filtered.edges, filtered.nodes])
  const visibleTieCountByNode = useMemo(() => {
    const counts = new Map(filtered.nodes.map((node) => [node.id, 0]))
    for (const edge of filtered.edges) {
      counts.set(edge.source, (counts.get(edge.source) || 0) + 1)
      counts.set(edge.target, (counts.get(edge.target) || 0) + 1)
    }
    return counts
  }, [filtered.edges, filtered.nodes])
  const searchResults = useMemo(() => {
    const clean = query.trim().toLowerCase()
    if (!clean) return []
    return snapshot.nodes
      .filter(
        (node) =>
          node.username.toLowerCase().includes(clean) ||
          node.label.toLowerCase().includes(clean),
      )
      .slice(0, 8)
  }, [query, snapshot.nodes])

  useEffect(() => {
    if (!containerRef.current) return
    const colors = themeColors(isDark)
    const labelSettings = labelSettingsForDensity(
      defaultSettings.labelPercentage,
    )
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
        labelDensity: labelSettings.density,
        labelFont: 'var(--font-manrope), sans-serif',
        labelRenderedSizeThreshold: labelSettings.renderedSizeThreshold,
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
      setSelectedNodeId((current) => {
        if (current && current !== node) {
          setFocusHistory((history) => [...history.slice(-7), current])
        }
        return node
      })
      setSelectedCommunityId(null)
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
    defaultSettings.labelPercentage,
  ])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    const labelSettings = labelSettingsForDensity(labelPercentage)
    renderer.setSetting('labelDensity', labelSettings.density)
    renderer.setSetting(
      'labelRenderedSizeThreshold',
      labelSettings.renderedSizeThreshold,
    )
    renderer.refresh()
  }, [labelPercentage])

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
        const alignedPositions = alignGraphLayout(
          layoutReferenceRef.current,
          event.data.result.positions,
        )
        layoutReferenceRef.current = alignedPositions
        setAdaptiveResult({
          ...event.data.result,
          positions: alignedPositions,
        })
        setAdaptiveSignature(workerSignatureRef.current)
        setAdaptiveError(null)
      },
    )
    worker.addEventListener('error', () => {
      setIsAdapting(false)
      setAdaptiveError('Adaptive graph worker failed')
    })
    requestAdaptiveGraph(worker)
    return () => {
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
    }
  }, [requestAdaptiveGraph])

  useEffect(() => {
    if (
      presetRecalculationRequest === 0 ||
      completedPresetRecalculationRef.current === presetRecalculationRequest ||
      isPending ||
      !workerRef.current ||
      filtered.nodes.length < 2
    ) {
      return
    }
    completedPresetRecalculationRef.current = presetRecalculationRequest
    requestAdaptiveGraph()
  }, [
    filtered.nodes.length,
    isPending,
    presetRecalculationRequest,
    requestAdaptiveGraph,
  ])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    const focus = hoveredNodeId || selectedNodeId
    renderer.setSetting('nodeReducer', (node, data) => {
      const isFocusNode = !focus || node === focus || neighborIds.has(node)
      const isCommunityNode =
        !selectedCommunityId || selectedCommunityNodeIds.has(node)
      const showHover = node === focus
      const forceLabel = labeledNodeIds.has(node) || node === focus

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
      !displayCommunities.some(
        (community) => community.id === selectedCommunityId,
      )
    ) {
      setSelectedCommunityId(null)
    }
  }, [displayCommunities, selectedCommunityId])

  useEffect(() => {
    if (
      selectedNodeId &&
      !filtered.nodes.some((node) => node.id === selectedNodeId)
    ) {
      setSelectedNodeId(null)
    }
  }, [filtered.nodes, selectedNodeId])

  useEffect(() => {
    if (!pendingFocusNodeId) return
    const frame = window.requestAnimationFrame(() => {
      const renderer = rendererRef.current
      const position = renderer?.getNodeDisplayData(pendingFocusNodeId)
      if (!renderer || !position) return
      const camera = renderer.getCamera()
      camera.animate(
        {
          x: position.x,
          y: position.y,
          ratio: Math.max(0.12, Math.min(0.65, camera.ratio / 2)),
        },
        { duration: 350 },
      )
      setPendingFocusNodeId(null)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [filtered.nodes, pendingFocusNodeId])

  const focusNode = (nodeId: string, rememberCurrent = true) => {
    const renderer = rendererRef.current
    const position = renderer?.getNodeDisplayData(nodeId)
    if (!baseVisibleNodeIds.has(nodeId)) setPinnedNodeId(nodeId)
    if (rememberCurrent && selectedNodeId && selectedNodeId !== nodeId) {
      setFocusHistory((history) => [...history.slice(-7), selectedNodeId])
    }
    setSelectedNodeId(nodeId)
    setSelectedCommunityId(null)
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
    } else {
      setPendingFocusNodeId(nodeId)
    }
  }

  const focusPreviousNode = () => {
    const previous = focusHistory.at(-1)
    if (!previous) return
    setFocusHistory((history) => history.slice(0, -1))
    focusNode(previous, false)
  }

  const focusNodeSet = (nodeIds: Set<string>) => {
    const renderer = rendererRef.current
    if (!renderer || !nodeIds.size) return
    const positions = Array.from(nodeIds).flatMap((nodeId) => {
      const position = renderer.getNodeDisplayData(nodeId)
      return position ? [position] : []
    })
    if (!positions.length) return
    const minX = Math.min(...positions.map((position) => position.x))
    const maxX = Math.max(...positions.map((position) => position.x))
    const minY = Math.min(...positions.map((position) => position.y))
    const maxY = Math.max(...positions.map((position) => position.y))
    const extent = Math.max(maxX - minX, maxY - minY)
    renderer.getCamera().animate(
      {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        ratio: Math.max(0.18, Math.min(1.1, extent * 1.8)),
      },
      { duration: 400 },
    )
  }

  const toggleCommunity = (communityId: string) => {
    const isClearing = selectedCommunityId === communityId
    setSelectedCommunityId(isClearing ? null : communityId)
    setSelectedNodeId(null)
    setFocusHistory([])
    setHoveredNodeId(null)
    hoverCandidateRef.current = null
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
    if (!isClearing) {
      const nodeIds = new Set(
        filtered.nodes
          .filter((node) => communityByNode.get(node.id) === communityId)
          .map((node) => node.id),
      )
      window.requestAnimationFrame(() => focusNodeSet(nodeIds))
    } else {
      rendererRef.current?.getCamera().animatedReset()
    }
  }

  const resetFilters = () => {
    setMinimumFollowers(defaultSettings.minimumFollowers)
    setStartYear(defaultSettings.startYear)
    setEndYear(defaultSettings.endYear)
    setMinimumStrength(defaultSettings.minimumStrength)
    setMaximumNodes(defaultSettings.maximumNodes)
    setLabelPercentage(defaultSettings.labelPercentage)
    setPinnedNodeId(null)
    setSelectedNodeId(null)
    setFocusHistory([])
    setSelectedCommunityId(null)
    setHoveredNodeId(null)
    setQuery('')
    rendererRef.current?.getCamera().animatedReset()
  }

  const applyPreset = (preset: 'core' | 'balanced' | 'broad') => {
    setPresetRecalculationRequest((request) => request + 1)
    setPinnedNodeId(null)
    setSelectedNodeId(null)
    setFocusHistory([])
    setSelectedCommunityId(null)
    if (preset === 'balanced') {
      resetFilters()
      return
    }
    setMinimumFollowers(defaultSettings.minimumFollowers)
    setStartYear(defaultSettings.startYear)
    setEndYear(defaultSettings.endYear)
    setMinimumStrength(
      preset === 'core'
        ? Math.min(
            STRENGTH_SLIDER_MAX,
            Math.max(0.6, defaultSettings.minimumStrength * 2),
          )
        : 0,
    )
    setMaximumNodes(
      preset === 'core'
        ? Math.min(360, snapshot.stats.nodeCount)
        : snapshot.stats.nodeCount,
    )
  }

  const exploreLargestGroup = () => {
    const group = displayCommunities.find(
      (community) => !community.id.includes('unconnected'),
    )
    if (group) toggleCommunity(group.id)
  }

  const zoom = (factor: number) => {
    const camera = rendererRef.current?.getCamera()
    if (!camera) return
    camera.animate({
      ratio: Math.max(0.08, Math.min(8, camera.ratio * factor)),
    })
  }

  const hasDetails = Boolean(selectedNode || selectedCommunity)

  return (
    <div
      className={
        hasDetails
          ? 'grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px]'
          : 'grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]'
      }
    >
      <aside className="space-y-4 rounded-[4px] border border-zinc-200 bg-white p-4 dark:border-[#26262a] dark:bg-[#1b1b1e]">
        <section>
          <h2 className="text-[13px] font-semibold">Start exploring</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                currentMemberNode && focusNode(currentMemberNode.id)
              }
              disabled={!currentMemberNode}
              title={
                currentMemberNode
                  ? `Find @${currentMemberNode.username}`
                  : 'Your signed-in X account is not in this snapshot'
              }
              className="disabled:opacity-45 flex h-9 items-center justify-center gap-1.5 rounded-[3px] border border-zinc-200 px-2 text-[12px] font-medium hover:bg-zinc-50 disabled:cursor-not-allowed dark:border-[#35353a] dark:hover:bg-[#242428]"
            >
              <LocateFixed className="h-3.5 w-3.5 text-brand" />
              Find yourself
            </button>
            <button
              type="button"
              onClick={exploreLargestGroup}
              disabled={!displayCommunities.length}
              className="disabled:opacity-45 flex h-9 items-center justify-center gap-1.5 rounded-[3px] border border-zinc-200 px-2 text-[12px] font-medium hover:bg-zinc-50 dark:border-[#35353a] dark:hover:bg-[#242428]"
            >
              <Network className="h-3.5 w-3.5 text-brand" />
              Explore groups
            </button>
          </div>

          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find someone…"
              aria-label="Find any archive member"
              aria-expanded={Boolean(query)}
              aria-controls="social-graph-search-results"
              aria-autocomplete="list"
              role="combobox"
              className="h-9 w-full rounded-[3px] border border-zinc-200 bg-transparent pl-8 pr-8 text-[13px] outline-none focus:border-brand dark:border-[#35353a]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-2 h-5 w-5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                aria-label="Clear member search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            {query ? (
              <div
                id="social-graph-search-results"
                role="listbox"
                className="absolute z-20 mt-1 w-full overflow-hidden rounded-[3px] border border-zinc-200 bg-white shadow-xl dark:border-[#35353a] dark:bg-[#1b1b1e]"
              >
                {searchResults.length ? (
                  searchResults.map((node) => {
                    const inView = baseVisibleNodeIds.has(node.id)
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedNodeId === node.id}
                        key={node.id}
                        onClick={() => focusNode(node.id)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] hover:bg-zinc-100 dark:hover:bg-[#26262a]"
                      >
                        <span className="min-w-0 truncate">
                          @{node.username}
                        </span>
                        <span className={`flex-shrink-0 ${MUTED}`}>
                          {inView
                            ? formatCount(node.followers)
                            : 'Show with ties'}
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <p className={`px-3 py-2 text-[12px] ${MUTED}`}>
                    No archive member matches this search.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <DualRangeSlider
          label="Time period"
          startValue={startYear}
          endValue={endYear}
          min={snapshot.temporal.minYear}
          max={snapshot.temporal.maxYear}
          onChange={(nextStartYear, nextEndYear) => {
            setStartYear(nextStartYear)
            setEndYear(nextEndYear)
          }}
        />

        <details className="rounded-[3px] border border-zinc-200 dark:border-[#35353a]">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-[12px] font-semibold [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="h-3.5 w-3.5 text-brand" />
            Refine view
          </summary>
          <div className="space-y-4 border-t border-zinc-200 p-3 dark:border-[#35353a]">
            <div>
              <p className="text-[12px] font-medium">Presets</p>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {(['core', 'balanced', 'broad'] as const).map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    onClick={() => applyPreset(preset)}
                    className="rounded-[3px] border border-zinc-200 px-1.5 py-1.5 text-[12px] capitalize hover:bg-zinc-50 dark:border-[#35353a] dark:hover:bg-[#242428]"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <p className={`mt-1.5 text-[12px] leading-relaxed ${MUTED}`}>
                Balanced restores the current curated defaults.
              </p>
            </div>

            <Slider
              label="Minimum followers"
              value={followerSlider}
              displayValue={formatCount(minimumFollowers)}
              min={0}
              max={100}
              step={1}
              onChange={(nextSlider) =>
                setMinimumFollowers(
                  followerSliderToCount(
                    nextSlider,
                    snapshot.stats.maxFollowers,
                  ),
                )
              }
            />
            <Slider
              label="Minimum mutual attention"
              value={minimumStrength}
              displayValue={`${minimumStrength.toFixed(2)}% each`}
              min={0}
              max={STRENGTH_SLIDER_MAX}
              step={0.05}
              onChange={setMinimumStrength}
            />
            <Slider
              label="People shown"
              value={maximumNodes}
              displayValue={`${maximumNodes}`}
              min={Math.min(50, snapshot.stats.nodeCount)}
              max={snapshot.stats.nodeCount}
              step={10}
              onChange={setMaximumNodes}
            />
            <div>
              <Slider
                label="Name density"
                value={labelPercentage}
                displayValue={`${labelPercentage}%`}
                min={0}
                max={100}
                step={5}
                onChange={setLabelPercentage}
              />
              <p className={`mt-1.5 text-[12px] leading-relaxed ${MUTED}`}>
                Representative names appear first. More names appear
                automatically as you zoom in.
              </p>
            </div>

            <div className="space-y-2.5 border-t border-zinc-200 pt-3 dark:border-[#35353a]">
              <div>
                <h2 className="text-[12px] font-semibold">Groups and layout</h2>
                <p className={`mt-1 text-[12px] leading-relaxed ${MUTED}`}>
                  Recalculate the algorithmic groups using only the people and
                  ties in this view.
                </p>
              </div>
              <button
                type="button"
                onClick={() => requestAdaptiveGraph()}
                disabled={isAdapting || filtered.nodes.length < 2}
                className="min-h-9 flex w-full items-center justify-center gap-1.5 rounded-[3px] bg-brand px-3 text-[12px] font-semibold text-zinc-950 disabled:cursor-wait disabled:opacity-60"
              >
                {isAdapting ? (
                  <Clock3 className="h-3.5 w-3.5 animate-pulse" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {isAdapting
                  ? 'Calculating…'
                  : 'Recalculate groups for this view'}
              </button>
              {adaptiveResult ? (
                <p className={`text-[12px] leading-relaxed ${MUTED}`}>
                  {adaptiveIsCurrent
                    ? `${adaptiveResult.communityCount} groups in the current view.`
                    : 'Filters changed; recalculate to update the groups.'}
                </p>
              ) : null}
              {adaptiveError ? (
                <p className="text-[12px] text-red-600 dark:text-red-400">
                  {adaptiveError}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={resetFilters}
              className="min-h-9 flex w-full items-center justify-center gap-1.5 rounded-[3px] border border-zinc-200 px-3 text-[12px] font-medium hover:bg-zinc-50 dark:border-[#35353a] dark:hover:bg-[#242428]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset filters
            </button>
          </div>
        </details>

        <div className="grid grid-cols-3 gap-2 border-y border-zinc-200 py-3 text-[12px] dark:border-[#2b2b30]">
          <div>
            <div className={MUTED}>People</div>
            <div className="mt-0.5 font-semibold tabular-nums">
              {filtered.nodes.length}
            </div>
          </div>
          <div>
            <div className={MUTED}>Ties</div>
            <div className="mt-0.5 font-semibold tabular-nums">
              {filtered.edges.length}
            </div>
          </div>
          <div>
            <div className={MUTED}>No tie</div>
            <div className="mt-0.5 font-semibold tabular-nums">
              {isolatedNodeCount}
            </div>
          </div>
        </div>

        {pinnedNodeId && !baseVisibleNodeIds.has(pinnedNodeId) ? (
          <p className="rounded-[3px] border border-brand/25 bg-brand/10 p-2 text-[12px] leading-relaxed">
            Showing @{nodeById.get(pinnedNodeId)?.username} and their strongest
            surviving ties outside the current people filters.
          </p>
        ) : null}

        {filtered.omittedEdgesForPerformance > 0 ? (
          <p className="rounded-[3px] border border-amber-500/25 bg-amber-500/10 p-2 text-[12px] text-amber-700 dark:text-amber-300">
            {formatCount(filtered.omittedEdgesForPerformance)} weaker ties are
            hidden to keep interaction smooth.
          </p>
        ) : null}

        <section>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold">Groups in this view</h2>
            {selectedCommunity ? (
              <button
                type="button"
                onClick={() => toggleCommunity(selectedCommunity.id)}
                className="text-[12px] text-zinc-500 hover:text-zinc-900 dark:text-[#a7a7b4] dark:hover:text-white"
              >
                Back to all
              </button>
            ) : null}
          </div>
          <p className={`mt-1 text-[12px] leading-relaxed ${MUTED}`}>
            Algorithmic groups, named by representative people—not
            self-identified communities.
          </p>
          <div
            className="mt-2 max-h-52 space-y-1 overflow-auto pr-1"
            tabIndex={0}
            aria-label="Groups in this graph view"
          >
            {displayCommunities.slice(0, 14).map((cluster) => {
              const isSelected = selectedCommunityId === cluster.id
              return (
                <button
                  type="button"
                  key={cluster.id}
                  title={cluster.label}
                  aria-pressed={isSelected}
                  onClick={() => toggleCommunity(cluster.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-[3px] px-1.5 py-1.5 text-left text-[12px] transition-colors ${
                    isSelected
                      ? 'bg-zinc-100 font-medium dark:bg-[#2b2b30]'
                      : 'hover:bg-zinc-50 dark:hover:bg-[#242428]'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: cluster.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{cluster.label}</span>
                  </span>
                  <span className={MUTED}>{cluster.nodeCount}</span>
                </button>
              )
            })}
          </div>
        </section>

        <details className={`text-[12px] leading-relaxed ${MUTED}`}>
          <summary className="cursor-pointer font-medium text-zinc-700 dark:text-[#d9d9de]">
            What a tie means
          </summary>
          <p className="mt-2">
            For each person, replies and quotes to the other are divided by all
            of that person&apos;s outgoing replies and quotes. A line uses the
            smaller percentage, so both people must direct attention to one
            another. It does not measure friendship, agreement, or sentiment.
          </p>
        </details>

        <details className={`text-[12px] leading-relaxed ${MUTED}`}>
          <summary className="cursor-pointer font-medium text-zinc-700 dark:text-[#d9d9de]">
            How groups and positions work
          </summary>
          <p className="mt-2">
            Louvain finds people with stronger mutual-interaction weight inside
            a group than outside it. The layout pulls tied people together and
            separates overlaps. Position suggests structure, not a precise
            social distance.
          </p>
        </details>
      </aside>

      <section className="relative min-h-[560px] overflow-hidden rounded-[4px] border border-zinc-200 bg-[#f8faf9] dark:border-[#26262a] dark:bg-[#101112]">
        <div
          ref={containerRef}
          className="absolute inset-0"
          aria-label="Interactive map of reciprocal replies and quotes. Use search or the group list for a structured way to select people."
        />
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-[3px] border border-zinc-200 bg-white/90 px-2.5 py-1.5 text-[12px] shadow-sm backdrop-blur dark:border-[#35353a] dark:bg-[#1b1b1e]/90">
          {filtered.nodes.length} of {snapshot.stats.nodeCount} people ·{' '}
          {filtered.edges.length} ties · {isolatedNodeCount} with no visible tie
        </div>
        <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-[3px] border border-zinc-200 bg-white/90 shadow-sm backdrop-blur dark:border-[#35353a] dark:bg-[#1b1b1e]/90">
          <button
            type="button"
            onClick={() => zoom(0.72)}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-[#26262a]"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => zoom(1.4)}
            className="border-y border-zinc-200 p-2 hover:bg-zinc-100 dark:border-[#35353a] dark:hover:bg-[#26262a]"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => rendererRef.current?.getCamera().animatedReset()}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-[#26262a]"
            aria-label="Reset camera"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-[3px] border border-zinc-200 bg-white/90 px-2.5 py-2 text-[12px] leading-relaxed text-zinc-600 shadow-sm backdrop-blur dark:border-[#35353a] dark:bg-[#1b1b1e]/90 dark:text-[#c4c4cc]">
          <div>
            Larger node = stronger visible ties · thicker line = more mutual
            attention · gray ring = no visible tie
          </div>
          <div className="mt-0.5 text-zinc-500 dark:text-[#a7a7b4]">
            Scroll to zoom and reveal more names · drag to pan · click a person
            to explore
          </div>
        </div>
        {isPending ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-pulse bg-brand" />
        ) : null}
      </section>

      <SocialGraphDetails
        selectedNode={selectedNode}
        selectedNodeCommunity={selectedNodeCommunity}
        selectedEdges={selectedEdges}
        selectedCommunity={selectedCommunity}
        communityMembers={selectedCommunityMembers}
        communityInternalEdges={selectedCommunityInternalEdges}
        bridgeMembers={selectedCommunityBridges}
        nodeById={nodeById}
        communityColorByNode={communityColorByNode}
        visibleTieCountByNode={visibleTieCountByNode}
        startYear={startYear}
        endYear={endYear}
        onFocusNode={(nodeId) => focusNode(nodeId)}
        canGoBack={focusHistory.length > 0}
        onBack={focusPreviousNode}
        onCloseNode={() => {
          setSelectedNodeId(null)
          setFocusHistory([])
        }}
        onCloseCommunity={() =>
          selectedCommunityId && toggleCommunity(selectedCommunityId)
        }
      />
    </div>
  )
}
