'use client'

import React from 'react'
import {
  subYears,
  eachDayOfInterval,
  format,
  getDay,
  startOfWeek,
  endOfWeek,
  eachMonthOfInterval,
  addDays,
  startOfDay,
  differenceInCalendarWeeks,
  differenceInDays,
} from 'date-fns'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type ActivityData = {
  [date: string]: number
}

interface ActivityTrackerProps {
  data?: ActivityData
}

const colorIntensity = (
  count: number,
  maxCount: number,
  isBeforeStart: boolean,
) => {
  if (isBeforeStart) return 'bg-transparent'
  if (count === 0) return 'bg-gray-200'
  const intensity = Math.ceil((count / maxCount) * 10)
  switch (intensity) {
    case 1:
      return 'bg-green-100'
    case 2:
      return 'bg-green-200'
    case 3:
      return 'bg-green-300'
    case 4:
      return 'bg-green-400'
    case 5:
      return 'bg-green-500'
    case 6:
      return 'bg-green-600'
    case 7:
      return 'bg-green-700'
    case 8:
      return 'bg-green-800'
    case 9:
      return 'bg-green-900'
    case 10:
      return 'bg-green-950'
    default:
      return 'bg-green-950'
  }
}

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function ActivityTracker({ data = {} }: ActivityTrackerProps) {
  // Derive start and end dates from data
  const dates = Object.keys(data).map((date) => new Date(date))
  const endDate = startOfDay(
    dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime())))
      : new Date(),
  )
  const dataStartDate = startOfDay(
    dates.length > 0
      ? new Date(Math.min(...dates.map((d) => d.getTime())))
      : new Date(),
  )

  const startDate = startOfWeek(
    dates.length > 0
      ? new Date(Math.min(...dates.map((d) => d.getTime())))
      : subYears(endDate, 1),
    { weekStartsOn: 0 },
  )

  const dateRange = eachDayOfInterval({ start: startDate, end: endDate })

  const activityData = data
  const maxCount = Math.max(...Object.values(activityData))

  const monthLabels = eachMonthOfInterval({
    start: startDate,
    end: endDate,
  }).map((month) => ({
    label: format(month, 'MMM'),
    column:
      differenceInCalendarWeeks(month, startDate, { weekStartsOn: 0 }) + 1,
  }))

  const numberOfWeeks = Math.ceil(differenceInDays(endDate, startDate) / 7) + 1
  const grid = Array.from({ length: 7 }, (_, dayIndex) =>
    Array.from({ length: numberOfWeeks }, (_, weekIndex) => {
      const date = addDays(startDate, weekIndex * 7 + dayIndex)
      return date <= endDate ? date : null
    }),
  )

  return (
    <TooltipProvider delayDuration={0}>
      <div className="p-8">
        <div className="max-w-full overflow-x-auto">
          <div className="inline-grid grid-cols-[auto_repeat(54,_1fr)] gap-1">
            {/* Month labels */}
            <div className="col-span-full mb-1">
              <div className="relative h-6">
                {monthLabels.map(({ label, column }, index) => (
                  <div
                    key={index}
                    className="absolute text-xs"
                    style={{ left: `${column * 20 + 20}px` }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Activity cells with weekday labels */}
            {grid.map((week, dayIndex) => (
              <React.Fragment key={dayIndex}>
                {/* Weekday label */}
                <div className="flex h-4 w-8 items-center justify-end pr-2 text-xs">
                  {weekdays[dayIndex]}
                </div>

                {/* Activity cells */}
                {week.map((date, weekIndex) => {
                  if (!date)
                    return <div key={`empty-${dayIndex}-${weekIndex}`} />

                  const formattedDate = format(date, 'yyyy-MM-dd')
                  const count = activityData[formattedDate] || 0
                  const isBeforeStart = date <= dataStartDate

                  return (
                    <Tooltip key={formattedDate}>
                      <TooltipTrigger asChild>
                        <div
                          className={`h-4 w-4 rounded-sm ${colorIntensity(
                            count,
                            maxCount,
                            isBeforeStart,
                          )} ${
                            isBeforeStart ? '' : 'border border-gray-300'
                          } cursor-pointer`}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold">
                          {format(date, 'EEEE, MMMM d, yyyy')}
                        </p>
                        <p>
                          {isBeforeStart ? 'No data' : `${count} activities`}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

// Remove or comment out the generateSampleData function if it's not needed
