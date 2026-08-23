'use client'

import { Info } from '@phosphor-icons/react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function BangersInfoTip() {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="How bangers are ranked"
            className="inline-flex text-zinc-400 transition-colors hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 dark:text-[#6d6d78] dark:hover:text-[#a7a7b4]"
          >
            <Info aria-hidden="true" className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[300px] text-[12.5px]">
          Bangers are ranked by distinct archived quotes from archive uploaders
          and opted-in members. Quotes by the original author do not count.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
