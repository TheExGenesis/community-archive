'use client'

import { useState } from 'react'
import { History } from 'lucide-react'
import type { ConversationSummary } from '@/lib/agentSearch/history'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { RecentConversations } from './RecentConversations'

const TRIGGER =
  'inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Past questions from inside a conversation: a popover on wide screens, a
 * bottom sheet on phones. Picking one opens it in place.
 */
export function ConversationHistory({
  conversations,
  currentId,
  onOpen,
  disabled,
}: {
  conversations: ConversationSummary[] | null
  currentId: string
  onOpen: (id: string) => void
  disabled?: boolean
}) {
  // Separate states: both triggers stay mounted (one hidden by CSS), and a
  // shared one would open the modal sheet behind the popover.
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  if (!conversations?.length) return null
  const pick = (id: string) => {
    setPopoverOpen(false)
    setSheetOpen(false)
    if (id !== currentId) onOpen(id)
  }
  const list = (
    <RecentConversations
      conversations={conversations}
      currentId={currentId}
      onOpen={pick}
      variant="compact"
    />
  )
  const label = (
    <>
      <History aria-hidden="true" className="h-4 w-4" />
      History
    </>
  )

  return (
    <>
      <div className="hidden lg:block">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button type="button" disabled={disabled} className={TRIGGER}>
              {label}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-[70vh] w-96 overflow-y-auto p-1"
          >
            {list}
          </PopoverContent>
        </Popover>
      </div>
      <div className="lg:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button type="button" disabled={disabled} className={TRIGGER}>
              {label}
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[70vh] overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
          >
            <SheetHeader className="px-2 text-left">
              <SheetTitle className="text-base">
                Your recent questions
              </SheetTitle>
            </SheetHeader>
            <div className="mt-2">{list}</div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
