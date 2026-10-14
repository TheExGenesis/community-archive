'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { citationSidebarOpener, closeCitationSidebar } from './citationSidebarStore'

/** The sidebar's width, and the room the page leaves for it. */
export const SIDEBAR_WIDTH = 'lg:w-[26rem] xl:w-[30rem]'
export const SIDEBAR_ROOM = 'lg:pr-[26rem] xl:pr-[30rem]'

/**
 * Wide screens: the cited tweets in a panel along the right edge, under the
 * site header, opened by a citation chip. It is not modal: the answer stays
 * readable and its chips keep working, a click elsewhere leaves it open, and
 * Escape or its close button shut it and return focus to the chip.
 */
export function CitationSidebar({
  open,
  children,
}: {
  open: boolean
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root
      open={open}
      modal={false}
      onOpenChange={(next) => !next && closeCitationSidebar()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => {
            // The panel, not the first tweet's like button; and the answer
            // being read does not scroll.
            event.preventDefault()
            ;(event.currentTarget as HTMLElement).focus({ preventScroll: true })
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            citationSidebarOpener()?.focus({ preventScroll: true })
          }}
          className={`fixed bottom-0 right-0 top-14 z-40 hidden border-l border-border bg-background shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right motion-reduce:animate-none lg:block ${SIDEBAR_WIDTH}`}
        >
          <DialogPrimitive.Title className="sr-only">
            Cited tweets
          </DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
