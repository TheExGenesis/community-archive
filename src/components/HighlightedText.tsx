import { Children, cloneElement, isValidElement, type ReactNode } from 'react'

/** Render matches as React text nodes: never interpret query or tweet text as HTML. */
export function HighlightedText({
  text,
  query,
}: {
  text: string
  query?: string
}) {
  const terms = Array.from(
    new Set(
      (query?.match(/"[^"]+"|[^\s]+/g) ?? [])
        .map((term) => term.replace(/^"|"$/g, ''))
        .filter(Boolean),
    ),
  ).sort((a, b) => b.length - a.length)
  if (!terms.length) return <>{text}</>
  const pattern = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'giu',
  )
  return (
    <>
      {text.split(pattern).map((part, index) =>
        index % 2 ? (
          <mark
            key={index}
            className="rounded-sm bg-amber-200/70 font-semibold text-inherit dark:bg-amber-500/25"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}

/** Highlight visible markdown text while preserving its elements and link targets. */
function highlightChildren(children: ReactNode, query: string): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string')
      return <HighlightedText text={child} query={query} />
    if (
      !isValidElement<{ children?: ReactNode }>(child) ||
      child.type === 'mark' ||
      child.props.children === undefined
    )
      return child
    return cloneElement(
      child,
      {},
      highlightChildren(child.props.children, query),
    )
  })
}

export function HighlightedChildren({
  children,
  query,
}: {
  children: ReactNode
  query?: string
}) {
  return <>{query ? highlightChildren(children, query) : children}</>
}
