'use client'

import * as PopoverPrimitive from '@radix-ui/react-popover'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { useNavigationAudience } from '@/components/NavigationAudience'
import { PopoverContent } from '@/components/ui/popover'
import { buildAskHref } from '@/lib/askFromSearch'
import { loginHref } from '@/lib/authRedirect'

/**
 * Asking from a search box: members go straight to Ask the archive; anyone
 * signed out gets a short explanation next to what they clicked, with a
 * sign-in that returns them to their question.
 */
export function useAskFromSearch(go: () => void) {
  const { isMember } = useNavigationAudience()
  const [explaining, setExplaining] = useState(false)
  const ask = () => (isMember ? go() : setExplaining(true))
  return { ask, explaining, setExplaining }
}

export function AskSignInPopover({
  open,
  onOpenChange,
  question,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The search text, carried to the Ask page after signing in. */
  question: string
  /** What the explanation points at: the Ask button or chip. */
  children: ReactNode
}) {
  const text = question.trim()
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Anchor asChild>{children}</PopoverPrimitive.Anchor>
      <PopoverContent align="end" className="w-80 space-y-3 text-sm">
        <p className="font-semibold text-foreground">
          Sign in to ask the archive
        </p>
        <p className="text-muted-foreground">
          Ask AI reads members’ tweets and writes a short answer that cites
          them. It’s for signed-in members of the archive.
        </p>
        {text && (
          <p className="line-clamp-3 rounded-md bg-muted px-2.5 py-1.5 text-foreground">
            {text}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Link
            href={loginHref(buildAskHref(text))}
            className="inline-flex h-9 items-center rounded-md bg-brand px-3 font-medium text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sign in
          </Link>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 items-center rounded-md px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Not now
          </button>
        </div>
        {text && (
          <p className="text-xs text-muted-foreground">
            Your question will be waiting after you sign in.
          </p>
        )}
      </PopoverContent>
    </PopoverPrimitive.Root>
  )
}
