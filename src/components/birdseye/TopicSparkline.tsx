import type { BirdseyeCluster } from '@/lib/community-apps/types'

export function TopicSparkline({
  years,
  start,
  end,
}: {
  years: BirdseyeCluster['years']
  start: number
  end: number
}) {
  if (!years.length)
    return <span className="text-xs text-muted-foreground">No dates</span>
  const counts = new Map(years.map((p) => [p.year, p.count]))
  const max = Math.max(1, ...years.map((p) => p.count))
  const points = Array.from(
    { length: Math.max(1, end - start + 1) },
    (_, index) => {
      const year = start + index
      return `${3 + (index / Math.max(1, end - start)) * 94},${27 - ((counts.get(year) ?? 0) / max) * 24}`
    },
  ).join(' ')
  return (
    <svg
      viewBox="0 0 100 32"
      className="h-8 w-24 shrink-0 text-brand"
      role="img"
      aria-label={`Cited posts by year, ${start}–${end}: ${years.map((p) => `${p.year}: ${p.count}`).join(', ')}`}
    >
      <path d="M3 28H97" stroke="currentColor" opacity="0.15" />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {end === start && (
        <circle
          cx="3"
          cy={27 - (years[0].count / max) * 24}
          r="2"
          fill="currentColor"
        />
      )}
    </svg>
  )
}
