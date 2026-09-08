'use client'
import { useState } from 'react'
import { AnalysisText } from '@/components/community-apps/AnalysisText'

export function TopicSummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!text.trim()) return null
  return (
    <div className="mt-2">
      <div
        className={`${expanded ? '' : 'line-clamp-2'} [&>div]:space-y-1 [&>div]:text-[13px] [&>div]:leading-5 [&_p]:mb-1`}
      >
        <AnalysisText>{text}</AnalysisText>
      </div>
      <button
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="mt-1 text-[11px] text-muted-foreground hover:text-brand"
      >
        Saved AI summary · {expanded ? 'Show less' : 'Read more'}
      </button>
    </div>
  )
}
