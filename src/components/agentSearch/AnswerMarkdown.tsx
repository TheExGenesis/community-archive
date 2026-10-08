import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { UNVERIFIED_HREF_PREFIX } from './messageView'

// Model-written markdown, so raw HTML is skipped and only reading elements are
// kept. Images are dropped: an answer should point at tweets, not embed URLs.
const ALLOWED_ELEMENTS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'del',
  'code',
  'a',
  'br',
  'blockquote',
  'hr',
]

const CHIP =
  'ml-0.5 inline-flex h-5 min-w-5 -translate-y-px items-center justify-center rounded-full px-1.5 align-middle text-[11px] font-semibold leading-none no-underline'

export function AnswerMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      allowedElements={ALLOWED_ELEMENTS}
      remarkPlugins={[remarkGfm]}
      skipHtml
      unwrapDisallowed
      components={{
        h1: ({ children: content }) => (
          <h3 className="mb-2 mt-6 text-lg font-semibold text-foreground first:mt-0">
            {content}
          </h3>
        ),
        h2: ({ children: content }) => (
          <h3 className="mb-2 mt-6 text-lg font-semibold text-foreground first:mt-0">
            {content}
          </h3>
        ),
        h3: ({ children: content }) => (
          <h4 className="mb-2 mt-5 text-base font-semibold text-foreground first:mt-0">
            {content}
          </h4>
        ),
        h4: ({ children: content }) => (
          <h4 className="mb-2 mt-5 text-base font-semibold text-foreground first:mt-0">
            {content}
          </h4>
        ),
        p: ({ children: content }) => (
          <p className="my-3 leading-7 first:mt-0 last:mb-0">{content}</p>
        ),
        ul: ({ children: content }) => (
          <ul className="my-3 list-disc space-y-1.5 pl-5 leading-7">
            {content}
          </ul>
        ),
        ol: ({ children: content }) => (
          <ol className="my-3 list-decimal space-y-1.5 pl-5 leading-7">
            {content}
          </ol>
        ),
        blockquote: ({ children: content }) => (
          <blockquote className="my-3 border-l-2 border-border pl-4 text-muted-foreground">
            {content}
          </blockquote>
        ),
        hr: () => <hr className="my-5 border-border" />,
        code: ({ children: content }) => (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
            {content}
          </code>
        ),
        a: ({ children: content, href }) => {
          if (href?.startsWith(UNVERIFIED_HREF_PREFIX)) {
            return (
              <span
                className={`${CHIP} border border-dashed border-border text-muted-foreground`}
                title="The agent cited a post its searches never returned"
              >
                unverified
              </span>
            )
          }
          if (href?.startsWith('#ask-')) {
            return (
              <a
                href={href}
                aria-label={`Citation ${String(content)}`}
                className={`${CHIP} bg-muted text-foreground transition-colors hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
              >
                {content}
              </a>
            )
          }
          if (!href) return <span>{content}</span>
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm text-brand underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {content}
            </a>
          )
        },
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
