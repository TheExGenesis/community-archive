'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * A link to another digest section that previews that section on hover or
 * keyboard focus. Touch devices simply follow the link.
 */
export function DigestRefLink({
  href,
  className,
  preview,
  children,
}: {
  href: string
  className?: string
  preview?: ReactNode
  children: ReactNode
}) {
  const link = (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
  if (!preview) return link
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side="top"
            align="start"
            collisionPadding={16}
            className="max-w-[min(360px,calc(100vw-32px))] whitespace-normal px-4 py-3 text-left"
          >
            {preview}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  )
}
