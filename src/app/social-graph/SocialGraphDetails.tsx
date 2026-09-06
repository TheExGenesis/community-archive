'use client'

import Link from 'next/link'
import { ArrowLeft, ExternalLink, X } from 'lucide-react'
import { MUTED, SERIF } from '@/components/portal/styles'
import type { SocialGraphEdge, SocialGraphNode } from '@/lib/socialGraph'
import { edgeDirectionTotals } from '@/lib/socialGraphView'

export interface DisplayCommunity {
  id: string
  label: string
  color: string
  nodeCount: number
}

interface BridgeMember {
  node: SocialGraphNode
  externalStrength: number
}

const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact' })

export function SocialGraphDetails({
  selectedNode,
  selectedNodeCommunity,
  selectedEdges,
  selectedCommunity,
  communityMembers,
  communityInternalEdges,
  bridgeMembers,
  nodeById,
  communityColorByNode,
  visibleTieCountByNode,
  startYear,
  endYear,
  onFocusNode,
  canGoBack,
  onBack,
  onCloseNode,
  onCloseCommunity,
}: {
  selectedNode?: SocialGraphNode
  selectedNodeCommunity?: DisplayCommunity
  selectedEdges: SocialGraphEdge[]
  selectedCommunity?: DisplayCommunity
  communityMembers: SocialGraphNode[]
  communityInternalEdges: SocialGraphEdge[]
  bridgeMembers: BridgeMember[]
  nodeById: Map<string, SocialGraphNode>
  communityColorByNode: Map<string, string>
  visibleTieCountByNode: Map<string, number>
  startYear: number
  endYear: number
  onFocusNode: (nodeId: string) => void
  canGoBack: boolean
  onBack: () => void
  onCloseNode: () => void
  onCloseCommunity: () => void
}) {
  if (!selectedNode && !selectedCommunity) return null

  return (
    <aside className="rounded-[4px] border border-zinc-200 bg-white p-4 dark:border-[#26262a] dark:bg-[#1b1b1e] lg:col-start-2 xl:col-start-auto">
      {selectedNode ? (
        <div>
          {canGoBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-3 flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-[#a7a7b4] dark:hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Previous person
            </button>
          ) : null}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-[12px] font-medium ${MUTED}`}>
                Person in this view
              </p>
              <h2
                className="mt-1 truncate text-[20px] font-semibold"
                style={SERIF}
              >
                {selectedNode.label}
              </h2>
              <p className={`truncate text-[12px] ${MUTED}`}>
                @{selectedNode.username} ·{' '}
                {compactNumber.format(selectedNode.followers)} followers
              </p>
            </div>
            <button
              type="button"
              onClick={onCloseNode}
              aria-label="Close person details"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-[#26262a] dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {selectedNodeCommunity ? (
            <div className="mt-3 flex items-center gap-2 text-[12px]">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: selectedNodeCommunity.color }}
                aria-hidden="true"
              />
              <span className="truncate">{selectedNodeCommunity.label}</span>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold">
              Reciprocal ties ({selectedEdges.length})
            </h3>
            {selectedNode.accountId ? (
              <Link
                href={`/user/${selectedNode.accountId}`}
                className="flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
              >
                Profile <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
          </div>

          <div className="mt-2 space-y-1.5">
            {selectedEdges.length ? (
              selectedEdges.slice(0, 12).map((edge) => {
                const neighborId =
                  edge.source === selectedNode.id ? edge.target : edge.source
                const neighbor = nodeById.get(neighborId)
                if (!neighbor) return null
                const totals = edgeDirectionTotals(edge, startYear, endYear)
                const sent =
                  edge.source === selectedNode.id
                    ? totals.sourceToTarget
                    : totals.targetToSource
                const received =
                  edge.source === selectedNode.id
                    ? totals.targetToSource
                    : totals.sourceToTarget

                return (
                  <button
                    type="button"
                    key={`${edge.source}:${edge.target}`}
                    onClick={() => onFocusNode(neighbor.id)}
                    className="w-full rounded-[3px] px-2 py-2 text-left hover:bg-zinc-50 dark:hover:bg-[#242428]"
                  >
                    <span className="flex items-center gap-2 text-[12px] font-medium">
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                        style={{
                          backgroundColor:
                            communityColorByNode.get(neighbor.id) || '#71717a',
                        }}
                        aria-hidden="true"
                      />
                      <span className="truncate">@{neighbor.username}</span>
                    </span>
                    <span
                      className={`mt-1 block pl-[18px] text-[12px] ${MUTED}`}
                    >
                      {sent} sent · {received} received · at least{' '}
                      {edge.strength.toFixed(2)}% each
                    </span>
                  </button>
                )
              })
            ) : (
              <p className={`py-2 text-[12px] ${MUTED}`}>
                No reciprocal tie survives the current filters.
              </p>
            )}
          </div>

          <p className={`mt-4 text-[12px] leading-relaxed ${MUTED}`}>
            “Sent” and “received” count replies and quotes during {startYear}–
            {endYear}. The percentage is the smaller share of either
            person&apos;s outgoing replies and quotes.
          </p>
        </div>
      ) : selectedCommunity ? (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-[12px] font-medium ${MUTED}`}>
                Algorithmic group in this view
              </p>
              <h2
                className="mt-1 text-[19px] font-semibold leading-tight"
                style={SERIF}
              >
                {selectedCommunity.label}
              </h2>
              <p className={`mt-1 text-[12px] ${MUTED}`}>
                {selectedCommunity.nodeCount} visible people
              </p>
            </div>
            <button
              type="button"
              onClick={onCloseCommunity}
              aria-label="Return to all groups"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-[#26262a] dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className={`mt-3 text-[12px] leading-relaxed ${MUTED}`}>
            This grouping comes from interaction structure. It is not a
            self-chosen community name or a claim about shared beliefs.
          </p>

          <section className="mt-4">
            <h3 className="text-[13px] font-semibold">Leading people</h3>
            <div className="mt-2 space-y-1">
              {communityMembers.slice(0, 10).map((member) => (
                <button
                  type="button"
                  key={member.id}
                  onClick={() => onFocusNode(member.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-[3px] px-2 py-1.5 text-left text-[12px] hover:bg-zinc-50 dark:hover:bg-[#242428]"
                >
                  <span className="truncate">@{member.username}</span>
                  <span className={MUTED}>
                    {visibleTieCountByNode.get(member.id) || 0} visible ties
                  </span>
                </button>
              ))}
            </div>
          </section>

          {communityInternalEdges.length ? (
            <section className="mt-4 border-t border-zinc-200 pt-4 dark:border-[#35353a]">
              <h3 className="text-[13px] font-semibold">
                Strongest ties inside the group
              </h3>
              <div className="mt-2 space-y-2 text-[12px]">
                {communityInternalEdges.slice(0, 5).map((edge) => {
                  const source = nodeById.get(edge.source)
                  const target = nodeById.get(edge.target)
                  if (!source || !target) return null
                  return (
                    <div
                      key={`${edge.source}:${edge.target}`}
                      className="flex items-start justify-between gap-2"
                    >
                      <span className="min-w-0 truncate">
                        @{source.username} ↔ @{target.username}
                      </span>
                      <span className={`flex-shrink-0 tabular-nums ${MUTED}`}>
                        {edge.strength.toFixed(2)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}

          {bridgeMembers.length ? (
            <section className="mt-4 border-t border-zinc-200 pt-4 dark:border-[#35353a]">
              <h3 className="text-[13px] font-semibold">
                Bridges to other groups
              </h3>
              <div className="mt-2 space-y-1">
                {bridgeMembers.slice(0, 5).map(({ node, externalStrength }) => (
                  <button
                    type="button"
                    key={node.id}
                    onClick={() => onFocusNode(node.id)}
                    className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-[12px] hover:bg-zinc-50 dark:hover:bg-[#242428]"
                  >
                    <ArrowLeft className="h-3 w-3 rotate-180 text-zinc-400" />
                    <span className="truncate">@{node.username}</span>
                    <span
                      className={`ml-auto flex-shrink-0 tabular-nums ${MUTED}`}
                    >
                      {externalStrength.toFixed(2)}%
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}
