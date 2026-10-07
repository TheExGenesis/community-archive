import Link from 'next/link'
import { HighlightedChildren } from '@/components/HighlightedText'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

export function AnalysisText({
  children,
  highlightQuery,
  className,
}: {
  children: string
  highlightQuery?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'space-y-4 text-[15px] leading-7 text-muted-foreground',
        className,
      )}
    >
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="mb-4 last:mb-0">
              <HighlightedChildren query={highlightQuery}>
                {children}
              </HighlightedChildren>
            </p>
          ),
          li: ({ children }) => (
            <li>
              <HighlightedChildren query={highlightQuery}>
                {children}
              </HighlightedChildren>
            </li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-brand underline"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="mb-4 list-disc pl-5">{children}</ul>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
export function EvidenceLinks({ ids }: { ids: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {ids.map((id, index) => (
        <Link
          key={id}
          href={`/tweets/${id}`}
          className="text-xs font-semibold text-brand hover:underline"
        >
          Source {index + 1} ↗
        </Link>
      ))}
    </span>
  )
}
