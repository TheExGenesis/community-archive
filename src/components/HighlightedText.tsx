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
