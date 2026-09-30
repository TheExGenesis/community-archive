'use client'

import { useEffect, useRef, useState } from 'react'

/** Counts one client-rendered page visit and shows the updated total. */
export function DigestViewCount({ editionId }: { editionId: string }) {
  const [count, setCount] = useState<number | null>(null)
  const recorded = useRef(false)

  useEffect(() => {
    if (recorded.current) return
    recorded.current = true
    void fetch(`/api/digest/${editionId}/view`, { method: 'POST' })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { count?: number } | null) => {
        if (typeof result?.count === 'number') setCount(result.count)
      })
      .catch(() => {
        // The article remains readable when engagement tracking is unavailable.
      })
  }, [editionId])

  return count === null ? null : (
    <span className="text-xs text-muted-foreground">
      {count.toLocaleString('en-US')} {count === 1 ? 'view' : 'views'}
    </span>
  )
}
