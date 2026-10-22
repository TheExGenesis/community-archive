'use client'

import { ChevronDown } from 'lucide-react'
import { PiSortAscending, PiSortDescending } from 'react-icons/pi'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ListSort, SortKey } from './listSort'

const LABELS: Record<SortKey, string> = {
  relevance: 'Relevance',
  count: 'Most tweets',
  date: 'Date',
}

/**
 * The list's order as one small menu: the trigger names the current sort
 * and its direction; the menu picks another or reverses this one.
 */
export function SortMenu({
  options,
  value,
  onChange,
}: {
  options: SortKey[]
  value: ListSort
  onChange: (value: ListSort) => void
}) {
  const Direction = value.ascending ? PiSortAscending : PiSortDescending
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Sort: ${LABELS[value.key].toLowerCase()}, ${value.ascending ? 'ascending' : 'descending'}`}
        className="inline-flex min-h-[2rem] items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground"
      >
        <Direction size={15} aria-hidden />
        {LABELS[value.key]}
        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuRadioGroup
          value={value.key}
          onValueChange={(key) =>
            onChange({ key: key as SortKey, ascending: false })
          }
        >
          {options.map((key) => (
            <DropdownMenuRadioItem key={key} value={key}>
              {LABELS[key]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onChange({ ...value, ascending: !value.ascending })}
        >
          Reverse order
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
