import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import TweetCard from '@/components/TweetCard'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SIDEBAR_MEDIA, useCitationLinks } from './CitationContext'
import { QUOTE_HREF_PREFIX, UNVERIFIED_HREF_PREFIX } from './messageView'
import { ProfileLink, ProfilePeopleContext } from './ProfilePreview'
import { remarkProfileLinks, type Person } from './profileLinks'
import { tweetLoadText } from './TweetPlaceholder'

export type { Person }

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
 * A numbered citation. On wide screens a click opens the tweet in the
 * sidebar without moving the page, and hovering lights both up; on narrow
 * ones it opens in a sheet.
 */
function CitationChip({
  href,
  children,
  warning,
}: {
  href: string
  children: ReactNode
  /** Set when the chip's sentence names someone other than the author. */
  warning?: string
}) {
  const links = useCitationLinks()
  const anchor = href.slice(1)
  const lit = links?.hovered === anchor || links?.selected?.anchor === anchor
  const citation = links?.citationFor(anchor)
  const tweet = citation?.tweet ?? undefined
  // A reopened conversation's chip keeps its number while its tweet is
  // fetched; until then it pulses, and if the tweet cannot be shown it says
  // why on hover.
  const state = citation?.state ?? 'loaded'
  // On a pointer that can hover, the tweet opens in a card after a short
  // pause and stays while the pointer moves onto it.
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  const later = (next: boolean, ms: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(next), ms)
  }
  const enter = () => {
    links?.hover(anchor)
    if (tweet && window.matchMedia('(hover: hover)').matches) later(true, 250)
  }
  const leave = () => {
    links?.hover(null)
    later(false, 150)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <a
          href={href}
          aria-label={`Citation ${String(children)}`}
          title={
            warning ?? (state === 'loaded' ? undefined : tweetLoadText(state))
          }
          data-tweet-state={state === 'loaded' ? undefined : state}
          data-author-mismatch={warning ? '' : undefined}
          onClick={(event) => {
            if (!links) return
            // Neither path follows the #anchor, so the page never jumps.
            event.preventDefault()
            if (window.matchMedia(SIDEBAR_MEDIA).matches) {
              links.openSidebar(anchor, event.currentTarget)
            } else links.openSheet(anchor, event.currentTarget)
          }}
          onMouseEnter={enter}
          onMouseLeave={leave}
          onFocus={() => links?.hover(anchor)}
          onBlur={() => links?.hover(null)}
          className={`${CHIP} ${CHIP_HIT_AREA} transition-colors hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            lit ? 'bg-brand text-brand-foreground' : 'bg-muted text-foreground'
          } ${
            state === 'loading'
              ? 'animate-pulse motion-reduce:animate-none'
              : state !== 'loaded'
                ? 'border border-dashed border-border text-muted-foreground'
                : warning
                  ? 'border border-dashed border-destructive/60 text-destructive'
                  : ''
          }`}
        >
          {children}
        </a>
      </PopoverTrigger>
      {tweet && (
        <PopoverContent
          side="top"
          align="start"
          className="w-[22rem] p-0"
          onMouseEnter={() => clearTimeout(timer.current)}
          onMouseLeave={() => later(false, 150)}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <TweetCard tweet={tweet} stacked compact collapsible showDate />
        </PopoverContent>
      )}
    </Popover>
  )
}

/**
 * A quote the page checked against the tweet it cites: the tweet's own
 * words. Hovering it lights up its citation, and clicking it opens the
 * tweet, as the chip does; the chip stays the keyboard's way in.
 */
function CheckedQuote({
  anchor,
  children,
}: {
  anchor: string
  children: ReactNode
}) {
  const links = useCitationLinks()
  const lit = links?.hovered === anchor || links?.selected?.anchor === anchor
  return (
    <q
      onMouseEnter={() => links?.hover(anchor)}
      onMouseLeave={() => links?.hover(null)}
      onClick={(event) => {
        if (!links) return
        // Selecting words to copy is not a click on the quote.
        if (window.getSelection()?.toString()) return
        // Focus comes back to the chip, the quote's control.
        const chip =
          event.currentTarget.parentElement?.querySelector<HTMLElement>(
            `a[href="#${CSS.escape(anchor)}"]`,
          ) ?? event.currentTarget
        if (window.matchMedia(SIDEBAR_MEDIA).matches) {
          links.openSidebar(anchor, chip)
        } else links.openSheet(anchor, chip)
      }}
      className={`cursor-pointer rounded-sm px-0.5 text-foreground transition-colors [box-decoration-break:clone] before:text-muted-foreground before:content-[open-quote] after:text-muted-foreground after:content-[close-quote] ${
        lit ? 'bg-brand/15' : 'bg-brand/[0.06]'
      }`}
    >
      {children}
    </q>
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
  a: ({ children: content, href, title }) => {
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
    if (href?.startsWith(QUOTE_HREF_PREFIX)) {
      return (
        <CheckedQuote anchor={href.slice(QUOTE_HREF_PREFIX.length)}>
          {content}
        </CheckedQuote>
      )
    }
    if (href?.startsWith('#ask-')) {
      return (
        <CitationChip href={href} warning={title}>
          {content}
        </CitationChip>
      )
    }
    if (!href) return <span>{content}</span>
    if (href.startsWith('/user/')) {
      return <ProfileLink href={href}>{content}</ProfileLink>
    }
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

const NO_PEOPLE: ReadonlyMap<string, Person> = new Map()

export const AnswerMarkdown = memo(function AnswerMarkdown({
  children,
  people = NO_PEOPLE,
}: {
  children: string
  /** People whose @handles link to their profiles. */
  people?: ReadonlyMap<string, Person>
}) {
  const remarkPlugins = useMemo(
    () => [...REMARK_PLUGINS, remarkProfileLinks(people)],
    [people],
  )
  return (
    <ProfilePeopleContext.Provider value={people}>
      <ReactMarkdown
        allowedElements={ALLOWED_ELEMENTS}
        remarkPlugins={remarkPlugins}
        skipHtml
        unwrapDisallowed
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </ProfilePeopleContext.Provider>
  )
})
