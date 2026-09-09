'use client'

import { captureProductAction } from '@/lib/productAnalytics'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import { TweetAvatar } from '@/components/portal/TweetRow'
import type { PortalTweet } from '@/lib/portal/types'
import {
  timelinePositions,
  postTimestamp,
  postMonth,
} from '@/lib/community-apps/strand-layout'
import { StrandThreadContext } from './StrandThreadContext'

export interface StrandPost {
  id: string
  annotation: string
  tweet?: PortalTweet
}
const date = (time: number) =>
  new Date(time).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
function Post({
  post,
  seedId,
  threadToggle = true,
}: {
  post: StrandPost
  seedId: string
  threadToggle?: boolean
}) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span>
          {postTimestamp(post.id, post.tweet?.createdAt) !== null
            ? date(postTimestamp(post.id, post.tweet?.createdAt)!)
            : 'Date unavailable'}
          {post.id === seedId ? ' · Seed post' : ''}
        </span>
      </div>
      {post.tweet ? (
        <TweetCard tweet={post.tweet} noClamp showDate clickable={false} />
      ) : (
        <div className="border border-border p-5">
          <p className="text-sm text-muted-foreground">
            This post isn’t available in the archive.
          </p>
          <Link
            href={`/tweets/${post.id}`}
            className="mt-2 inline-block text-sm text-brand"
          >
            Open source post ↗
          </Link>
        </div>
      )}
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {post.annotation}
      </p>
      {threadToggle && (
        <StrandThreadContext key={post.id} seedId={seedId} tweetId={post.id} />
      )}
    </div>
  )
}
export default function StrandTimeline({
  posts,
  seedId,
  color = 'hsl(260 65% 48%)',
}: {
  posts: StrandPost[]
  seedId: string
  color?: string
}) {
  const [view, setView] = useState<'map' | 'timeline'>('map')
  const [selected, setSelected] = useState(seedId)
  const selectPost = (id: string) => {
    captureProductAction('strands', 'node_selected')
    setSelected(id)
  }
  const [zoom, setZoom] = useState(1)
  const width = 810 * zoom
  const layout = useMemo(
    () =>
      timelinePositions(
        posts.map((p) => ({ id: p.id, createdAt: p.tweet?.createdAt })),
        width,
      ),
    [posts, width],
  )
  const ordered = layout.nodes.map((n) => posts.find((p) => p.id === n.id)!)
  const current = posts.find((p) => p.id === selected) ?? ordered[0]
  const baseline = layout.lanes * 82 + 55,
    height = baseline + 60
  const months = Array.from(
    new Set(layout.nodes.map((node) => node.month)),
  ).map((month) => ({
    month,
    nodes: layout.nodes.filter((node) => node.month === month),
  }))
  const monthLabel = (time: number) =>
    new Date(time).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  const index = ordered.findIndex((p) => p.id === current?.id)
  return (
    <section
      aria-label="Key posts in this strand"
      className="mt-12 border-t border-border pt-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Follow the strand</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {posts.length} key posts, from the first spark to later echoes.
          </p>
        </div>
        <div className="flex border border-border p-1" aria-label="Post view">
          {(['map', 'timeline'] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => {
                captureProductAction('strands', 'view_changed')
                setView(v)
              }}
              className="px-4 py-2 text-sm capitalize aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {view === 'map' ? (
        <>
          <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
            <p>Posts are positioned by date. Select a post to read.</p>
            <div className="flex gap-2">
              <button
                aria-label="Zoom out on timeline"
                disabled={zoom === 1}
                onClick={() => setZoom((z) => Math.max(1, z - 1))}
                className="h-8 w-8 border border-border disabled:opacity-30"
              >
                −
              </button>
              <button
                aria-label="Zoom in on timeline"
                disabled={zoom === 4}
                onClick={() => setZoom((z) => Math.min(4, z + 1))}
                className="h-8 w-8 border border-border disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>
          <div
            className="mx-auto mt-3 w-full overflow-x-auto border border-border bg-card p-2 [scrollbar-width:none] sm:w-[90%] [&::-webkit-scrollbar]:hidden"
            tabIndex={0}
            aria-label="Scrollable key post map"
          >
            <svg
              viewBox={`0 0 ${width} ${height}`}
              style={{
                width: `${zoom * 100}%`,
                minWidth: '100%',
                maxWidth: 'none',
                height: 'auto',
              }}
              role="group"
              aria-label="Chronological key post map"
            >
              <line
                x1="45"
                x2={width - 40}
                y1={baseline}
                y2={baseline}
                stroke="currentColor"
                opacity="0.25"
              />
              {Array.from({ length: 6 }, (_, i) => {
                const time = layout.min + ((layout.max - layout.min) * i) / 5
                const x = 70 + ((width - 280) * i) / 5
                return (
                  <text
                    key={i}
                    x={x}
                    y={baseline + 25}
                    fontSize="10"
                    fill="currentColor"
                    opacity="0.65"
                  >
                    {date(time)}
                  </text>
                )
              })}
              {layout.nodes.map((node, i) => {
                const post = posts.find((p) => p.id === node.id)!,
                  y = 30 + node.lane * 82,
                  active = current?.id === node.id
                const label =
                  post.annotation.split(/[:.!?]/)[0].slice(0, 46) || 'Key post'
                return (
                  <g key={node.id}>
                    <circle
                      data-post-dot={node.id}
                      cx={node.x}
                      cy={baseline}
                      r={active ? 6 : 3.5}
                      fill={color}
                    />
                    <path
                      d={`M${node.x},${baseline} L${node.x},${y + 40} Q${node.x},${y + 18} ${node.x + 16},${y + 18}`}
                      stroke={color}
                      opacity={active ? 1 : 0.3}
                      fill="none"
                      strokeWidth={active ? 2 : 1}
                    />
                    <g
                      role="button"
                      tabIndex={0}
                      aria-label={`${i + 1}. ${post.tweet ? '@' + post.tweet.username : 'Source post'} · ${date(node.time)} · ${label}`}
                      aria-pressed={active}
                      onClick={() => selectPost(node.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          selectPost(node.id)
                        }
                      }}
                      className="cursor-pointer outline-none focus:stroke-foreground"
                    >
                      <title>{post.annotation}</title>
                      <rect
                        x={node.x + 12}
                        y={y - 3}
                        width="177"
                        height="66"
                        rx="5"
                        fill="hsl(var(--card))"
                        stroke={active ? color : 'hsl(var(--border))'}
                        strokeWidth={active ? 2 : 1}
                      />
                      <foreignObject
                        x={node.x + 18}
                        y={y + 3}
                        width="30"
                        height="30"
                        style={{ pointerEvents: 'none' }}
                      >
                        {post.tweet ? (
                          <TweetAvatar tweet={post.tweet} size={28} />
                        ) : (
                          <span className="text-xs">↗</span>
                        )}
                      </foreignObject>
                      <text
                        x={node.x + 55}
                        y={y + 15}
                        fontSize="10"
                        fontWeight="600"
                        fill="currentColor"
                      >
                        {post.tweet ? '@' + post.tweet.username : 'Source post'}
                      </text>
                      <text
                        x={node.x + 55}
                        y={y + 29}
                        fontSize="9"
                        fill="currentColor"
                        opacity="0.6"
                      >
                        {node.id === seedId ? 'Seed · ' : ''}
                        {date(node.time)}
                      </text>
                      <text
                        x={node.x + 19}
                        y={y + 50}
                        fontSize="10"
                        fill="currentColor"
                      >
                        {label.length > 27 ? label.slice(0, 27) + '…' : label}
                      </text>
                    </g>
                  </g>
                )
              })}
            </svg>
          </div>
          {current && (
            <div className="mx-auto mt-6 max-w-2xl">
              <div className="mb-4 flex items-center justify-between">
                <button
                  disabled={index <= 0}
                  onClick={() => selectPost(ordered[index - 1].id)}
                  className="text-sm text-brand disabled:opacity-30"
                >
                  ← Previous post
                </button>
                <span className="text-xs text-muted-foreground">
                  {index + 1} / {ordered.length}
                </span>
                <button
                  disabled={index >= ordered.length - 1}
                  onClick={() => selectPost(ordered[index + 1].id)}
                  className="text-sm text-brand disabled:opacity-30"
                >
                  Next post →
                </button>
              </div>
              <StrandThreadContext
                key={current.id}
                seedId={seedId}
                tweetId={current.id}
              >
                <Post post={current} seedId={seedId} threadToggle={false} />
              </StrandThreadContext>
            </div>
          )}
        </>
      ) : (
        <ol className="mx-auto mt-8 max-w-2xl border-l border-border pl-7">
          {months.map(({ month }) => (
            <li key={month} className="relative pb-10">
              <span
                data-timeline-month={month}
                className="absolute -left-[33px] top-1 h-2.5 w-2.5 rounded-full"
                style={{ background: color }}
              />
              <h3 className="mb-5 text-sm font-semibold">
                {monthLabel(month)}
              </h3>
              <div className="space-y-8">
                {ordered
                  .filter(
                    (post) =>
                      postMonth(
                        postTimestamp(post.id, post.tweet?.createdAt)!,
                      ) === month,
                  )
                  .map((post) => (
                    <Post key={post.id} post={post} seedId={seedId} />
                  ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
