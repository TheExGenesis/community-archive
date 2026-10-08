'use client'

import { History } from 'lucide-react'
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

/** The member's past conversations; opening one restores it in place. */
export function RecentConversations({
  conversations,
  onOpen,
}: {
  conversations: ConversationSummary[] | null
  onOpen: (id: string) => void
}) {
  if (!conversations?.length) return null
  return (
    <section aria-labelledby="recent-conversations" className="mt-10">
      <h2
        id="recent-conversations"
        className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
      >
        <History aria-hidden="true" className="h-4 w-4" />
        Your recent questions
      </h2>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onOpen(conversation.id)}
              className="flex w-full items-baseline justify-between gap-4 px-4 py-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="line-clamp-2 min-w-0 break-words text-sm text-foreground">
                {conversation.title}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {conversation.status === 'running'
                  ? 'Answering'
                  : [
                      conversation.turns > 1
                        ? `${conversation.turns} questions`
                        : null,
                      when(conversation.updatedAt),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
