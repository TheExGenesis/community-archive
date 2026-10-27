import Link from 'next/link'
import { LockKeyhole, MessageCircle, Quote } from 'lucide-react'

function PlaceholderPost() {
  return (
    <div
      aria-hidden="true"
      className="space-y-4 border border-border bg-card p-5"
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-2.5 w-24 rounded bg-muted" />
          <div className="h-2 w-16 rounded bg-muted/60" />
        </div>
      </div>
      <div className="space-y-2.5">
        <div className="h-2.5 w-full rounded bg-muted" />
        <div className="h-2.5 w-5/6 rounded bg-muted" />
        <div className="h-2.5 w-2/3 rounded bg-muted/60" />
      </div>
    </div>
  )
}

export function TweetConversationPreview({
  kind,
  href,
}: {
  kind: 'replies' | 'quotes'
  href: string
}) {
  const title = kind === 'replies' ? 'Replies' : 'Quote tweets'
  const Icon = kind === 'replies' ? MessageCircle : Quote
  return (
    <section
      aria-label={`${title} preview`}
      className={kind === 'replies' ? 'mt-10' : ''}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Icon className="h-4 w-4 text-brand" aria-hidden />
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">Preview</span>
      </div>
      <div className="relative">
        <div className="space-y-3 opacity-60">
          <PlaceholderPost />
          <PlaceholderPost />
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-background/10 via-background/75 to-background/95 p-5">
          <div className="max-w-xs text-center">
            <LockKeyhole
              className="mx-auto mb-3 h-5 w-5 text-brand"
              aria-hidden
            />
            <p className="font-semibold text-foreground">
              Unlock {title.toLowerCase()}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Opt in to see the archived conversation.
            </p>
            <Link
              href={href}
              className="mt-3 inline-block text-sm font-semibold text-brand underline underline-offset-4"
            >
              Join Community Archive
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
