import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const INLINE_ELEMENTS = ['p', 'strong', 'em', 'del', 'code', 'a', 'br']

export function DigestMarkdown({
  children,
  allowLinks = true,
}: {
  children: string
  allowLinks?: boolean
}) {
  return (
    <ReactMarkdown
      allowedElements={INLINE_ELEMENTS}
      remarkPlugins={[remarkGfm]}
      skipHtml
      unwrapDisallowed
      components={{
        p: ({ children: content }) => <>{content}</>,
        a: ({ children: content, href }) =>
          allowLinks && href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm text-brand underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {content}
            </a>
          ) : (
            <span>{content}</span>
          ),
        code: ({ children: content }) => (
          <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.9em] dark:bg-zinc-800">
            {content}
          </code>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
