import { Sparkles } from 'lucide-react'
import { fallbackTitle, type TweetPageSubject } from '@/lib/tweetSummary/subject'
import type { GeneratedSummary } from '@/lib/tweetSummary/generation'

export default function SummaryHeading({
  subject,
  summary,
}: {
  subject: TweetPageSubject
  summary: GeneratedSummary | null
}) {
  return (
    <>
      <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-foreground [text-wrap:balance] sm:text-5xl">
        {summary?.title ?? fallbackTitle(subject)}
      </h1>
      {summary && (
        <>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            {summary.description}
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground/80">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            AI-generated summary. The author&rsquo;s original words are below.
          </p>
        </>
      )}
    </>
  )
}
