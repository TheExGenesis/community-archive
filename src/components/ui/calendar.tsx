'use client'

import * as React from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { DayPicker } from 'react-day-picker'

import { cn } from '@/utils/tailwind'
import { buttonVariants } from '@/components/ui/button'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'space-y-4',
        month_caption: 'flex h-7 justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium',
        nav: 'absolute inset-x-1 top-0 z-10 flex items-center justify-between',
        button_previous: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
        ),
        weekdays: 'flex',
        weekday:
          'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
        month_grid: 'w-full border-collapse space-y-1',
        week: 'flex w-full mt-2',
        day: 'h-9 w-9 text-center text-sm p-0 relative [&.day-range-end]:rounded-r-md [&.day-outside[aria-selected]]:bg-accent/50 aria-selected:bg-accent first:aria-selected:rounded-l-md last:aria-selected:rounded-r-md focus-within:relative focus-within:z-20',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
        ),
        range_end: 'day-range-end',
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground [&>button:focus]:bg-primary [&>button:focus]:text-primary-foreground',
        today: '[&>button]:bg-accent [&>button]:text-accent-foreground',
        outside:
          'day-outside text-muted-foreground opacity-50 aria-selected:[&>button]:bg-accent/50 aria-selected:[&>button]:text-muted-foreground aria-selected:opacity-30',
        disabled: 'text-muted-foreground opacity-50',
        range_middle:
          'aria-selected:[&>button]:bg-accent aria-selected:[&>button]:text-accent-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...props }) => {
          const Icon =
            orientation === 'left'
              ? ChevronLeft
              : orientation === 'up'
                ? ChevronUp
                : orientation === 'down'
                  ? ChevronDown
                  : ChevronRight

          return <Icon {...props} className={cn('h-4 w-4', props.className)} />
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
