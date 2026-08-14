'use client'

import { Archive, Radio } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function MembershipStatusIcon({
  hasArchive,
  isOptedIn,
}: {
  hasArchive: boolean
  isOptedIn: boolean
}) {
  const label = hasArchive ? 'Archive uploaded' : isOptedIn ? 'Opted in' : null
  const Icon = hasArchive ? Archive : Radio
  if (!label) return null
  const colorClassName = hasArchive
    ? 'text-[#25AADF]/70 hover:bg-[#25AADF]/5 hover:text-[#25AADF] focus-visible:ring-[#25AADF]'
    : 'text-brand/60 hover:bg-brand/5 hover:text-brand focus-visible:ring-brand'

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            tabIndex={0}
            aria-label={label}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-background ${colorClassName}`}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
