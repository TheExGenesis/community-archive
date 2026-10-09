import { memo } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { RAIL_MEDIA, useCitationLinks } from './CitationContext'
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
  'ml-0.5 inline-flex h-5 min-w-[1.25rem] -translate-y-px items-center justify-center rounded-full px-1.5 align-middle text-[11px] font-semibold leading-none no-underline'

// The chip stays 20px to read as a footnote, but takes taps over 32px of
// height. On touch screens chips sit 6px apart so neighbours' areas don't
// overlap.
const CHIP_HIT_AREA =
  "relative after:absolute after:-inset-x-[3px] after:-inset-y-1.5 after:content-[''] [@media(pointer:coarse)]:ml-1.5"

/**
 * A numbered citation. With the rail beside the answer, a click brings the
 * post into the rail without moving the page, and hovering lights both up.
 */
function CitationChip({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  const links = useCitationLinks()
  const anchor = href.slice(1)
  const lit = links?.hovered === anchor || links?.selected?.anchor === anchor
  return (
    <a
      href={href}
      aria-label={`Citation ${String(children)}`}
      onClick={(event) => {
        if (!links) return
        // Neither path follows the #anchor, so the page never jumps.
        event.preventDefault()
        if (window.matchMedia(RAIL_MEDIA).matches) links.select(anchor)
        else links.openSheet(anchor, event.currentTarget)
      }}
      onMouseEnter={() => links?.hover(anchor)}
      onMouseLeave={() => links?.hover(null)}
      onFocus={() => links?.hover(anchor)}
      onBlur={() => links?.hover(null)}
      className={`${CHIP} ${CHIP_HIT_AREA} transition-colors hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        lit ? 'bg-brand text-brand-foreground' : 'bg-muted text-foreground'
      }`}
    >
      {children}
    </a>
  )
}

// Module-level so every render passes the same component types. A fresh
// object per render would remount the whole answer, which loses the reader's
// selection and detaches the nodes the turn observes for reading position.
const COMPONENTS: Components = {
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
    <ul className="my-3 list-disc space-y-1.5 pl-5 leading-7">{content}</ul>
  ),
  ol: ({ children: content }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 leading-7">{content}</ol>
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
      return <CitationChip href={href}>{content}</CitationChip>
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
}

const REMARK_PLUGINS = [remarkGfm]

export const AnswerMarkdown = memo(function AnswerMarkdown({
  children,
}: {
  children: string
}) {
  return (
    <ReactMarkdown
      allowedElements={ALLOWED_ELEMENTS}
      remarkPlugins={REMARK_PLUGINS}
      skipHtml
      unwrapDisallowed
      components={COMPONENTS}
    >
      {children}
    </ReactMarkdown>
  )
})
