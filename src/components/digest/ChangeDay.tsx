'use client'

import { useEffect, useState } from 'react'
import { changeDayLabel } from '@/lib/digest/weeklyChanges'

const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/**
 * The day a weekly story changed, as "today" or "yesterday" in the reader's
 * own timezone once in the browser. The cached server render shows the
 * weekday, which is never wrong.
 */
export function ChangeDay({ day }: { day: string }) {
  const [label, setLabel] = useState(() => changeDayLabel(day))
  useEffect(() => {
    setLabel(changeDayLabel(day, localDay(new Date())))
  }, [day])
  return <>{label}</>
}
