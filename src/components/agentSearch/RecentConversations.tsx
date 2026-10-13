'use client'

import type { ConversationSummary } from '@/lib/agentSearch/history'

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

function when(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : dateFormat.format(date)
}

function detail(conversation: ConversationSummary) {
  if (conversation.status === 'running') return 'Answering'
  return [
    conversation.turns > 1 ? `${conversation.turns} questions` : null,
    when(conversation.updatedAt),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * The member's past conversations; opening one restores it in place. The
 * compact variant is the bare list, for the History popover and sheet.
 */
export function RecentConversations({
  conversations,
  onOpen,
  currentId,
  variant = 'section',
}: {
  conversations: ConversationSummary[] | null
  onOpen: (id: string) => void
  currentId?: string
  variant?: 'section' | 'compact'
}) {
  if (!conversations?.length) return null
  const compact = variant === 'compact'

  const list = (
    <ul
      className={
        compact ? 'divide-y divide-border' : 'divide-y divide-border border-y'
      }
    >
      {conversations.map((conversation) => {
        const current = conversation.id === currentId
        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onOpen(conversation.id)}
              aria-current={current ? 'page' : undefined}
              className={`flex w-full items-baseline justify-between gap-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                compact
                  ? 'min-h-[2.75rem] rounded-md px-3 py-2.5'
                  : 'min-h-[2.75rem] px-1 py-2.5'
              } ${current ? 'bg-muted' : ''}`}
            >
              <span className="line-clamp-2 min-w-0 break-words text-sm text-foreground">
                {conversation.title}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {current ? 'Open now' : detail(conversation)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )

  if (compact) return list
  return (
    <section aria-labelledby="recent-conversations" className="mt-10">
      <h2
        id="recent-conversations"
        className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground [font-family:inherit]"
      >
        Recent
      </h2>
      {list}
    </section>
  )
}
