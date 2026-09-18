'use client'

import { useEffect, useState } from 'react'

/** Honest elapsed-time hints, without implying server progress we cannot measure. */
export function LoadingStatus({
  label,
  slowLabel,
  className,
}: {
  label: string
  slowLabel: string
  className?: string
}) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    setStage(0)
    const slow = setTimeout(() => setStage(1), 2000)
    const long = setTimeout(() => setStage(2), 10000)
    return () => {
      clearTimeout(slow)
      clearTimeout(long)
    }
  }, [label, slowLabel])
  return (
    <span role="status" aria-live="polite" className={className}>
      {stage === 0
        ? label
        : stage === 1
          ? slowLabel
          : `${slowLabel} This is taking longer than usual.`}
    </span>
  )
}
