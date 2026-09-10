import type { Strand } from '@/lib/community-apps/types'
export function StrandActivity({
  activity,
  color,
}: {
  activity: Strand['activity']
  color?: string
}) {
  if (!activity?.counts.length) return null
  const { counts, months } = activity
  const max = Math.max(1, ...counts)
  const x = (i: number) => 3 + (i * 294) / Math.max(1, counts.length - 1)
  const y = (n: number) => 36 - (n / max) * 31
  return (
    <figure className="mt-4" aria-label="Strand activity over time">
      <svg
        viewBox="0 0 300 42"
        className="h-14 w-full"
        role="img"
        aria-label="Monthly posts in the original strand snapshot"
        style={{ color: color ?? 'currentColor' }}
      >
        <path d="M3 37H297" stroke="currentColor" opacity="0.2" />
        <polyline
          points={counts.map((count, i) => `${x(i)},${y(count)}`).join(' ')}
          stroke="currentColor"
          strokeWidth="1.3"
          fill="none"
        />
        {counts.map((count, i) => (
          <rect
            key={months[i]}
            x={x(i) - 1}
            y="0"
            width={Math.max(2, 294 / counts.length)}
            height="40"
            fill="transparent"
          >
            <title>{`${months[i]}: ${count} posts`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="flex justify-between text-[10px] text-muted-foreground">
        <span>{months[0]}</span>
        <span>Monthly posts · saved snapshot</span>
        <span>{months.at(-1)}</span>
      </figcaption>
    </figure>
  )
}
