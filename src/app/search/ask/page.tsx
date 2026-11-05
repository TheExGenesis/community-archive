import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import AgentSearch from '@/components/agentSearch/AgentSearch'
import {
  ASK_PREFILL_PARAMS,
  askPrefillFrom,
  askReturnPath,
} from '@/lib/askFromSearch'
import { agentSearchEnabled } from '@/lib/agentSearch/enabled'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'
import { sharedConversationRuns } from '@/lib/agentSearch/sharedConversation'
import { agentSearchVisible } from '@/lib/agentSearch/visibility'
import { loginHref } from '@/lib/authRedirect'

// Eligibility depends on the session cookie, so this page is never cached.
export const dynamic = 'force-dynamic'

type AskSearchParams = { c?: string | string[] } & Partial<
  Record<(typeof ASK_PREFILL_PARAMS)[number], string | string[]>
>

const BASE_METADATA: Metadata = {
  title: 'Ask the archive · Community Archive',
  description:
    'Members with an uploaded archive can ask questions about the community’s tweets and get answers that cite them.',
  robots: { index: false, follow: false },
}

const TITLE_LENGTH = 80

function requestedConversation(searchParams: AskSearchParams | undefined) {
  const requested = typeof searchParams?.c === 'string' ? searchParams.c : null
  return requested && /^[A-Za-z0-9_-]{8,100}$/.test(requested)
    ? requested
    : null
}

// A shared conversation's link previews with its first question as the
// title; everything else keeps the page's own.
export async function generateMetadata({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<AskSearchParams>
}): Promise<Metadata> {
  const requested = requestedConversation(await searchParamsPromise)
  if (!requested || !(await agentSearchVisible())) return BASE_METADATA
  const runs = await sharedConversationRuns(requested).catch(() => null)
  if (!runs) return BASE_METADATA
  const question = runs[0].question.replace(/\s+/g, ' ').trim()
  const title =
    question.length > TITLE_LENGTH
      ? `${question.slice(0, TITLE_LENGTH - 1).trimEnd()}…`
      : question
  return {
    ...BASE_METADATA,
    title: `${title} · Ask the archive`,
    description:
      'A question answered from the Community Archive’s tweets, with the posts it cites. Shared by a member.',
    openGraph: {
      title,
      description: 'Ask the archive · Community Archive',
      type: 'article',
    },
  }
}

function Gate({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action: { href: string; label: string }
}) {
  return (
    <main className="min-h-[70vh] bg-background">
      <section className="mx-auto w-full max-w-xl px-4 py-14 sm:px-6 sm:py-20">
        <Link
          href="/search"
          className="rounded-sm text-sm text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← Archive search
        </Link>
        <h1 className="mt-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <div className="mt-4 space-y-3 leading-7 text-muted-foreground">
          {children}
        </div>
        <Link
          href={action.href}
          className="mt-7 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {action.label}
        </Link>
      </section>
    </main>
  )
}

export default async function AskTheArchivePage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<AskSearchParams>
}) {
  // Before launch (AGENT_SEARCH_LAUNCHED) the page exists for admins only.
  if (!(await agentSearchVisible())) notFound()
  const searchParams = await searchParamsPromise
  const access = await getAgentSearchViewer()
  const requested = requestedConversation(searchParams)

  // A shared conversation is readable by anyone with its link: a visitor
  // who cannot ask (signed out, or not a member) gets it to read, and the
  // sign-in gate only when it is not shared.
  if (!access.ok && requested && (await sharedConversationRuns(requested))) {
    return <AgentSearch initialConversationId={requested} guest />
  }

  if (!access.ok && access.reason === 'signed_out') {
    return (
      <Gate
        title="Ask the archive"
        // Back to this page with its conversation and any search handed
        // over from archive search, so the question is still there.
        action={{
          href: loginHref(askReturnPath(searchParams)),
          label: 'Sign in',
        }}
      >
        <p>
          Ask a question about the community’s tweets and get a short answer
          that cites the posts it is based on. Sign in to start.
        </p>
      </Gate>
    )
  }

  if (!access.ok) {
    return (
      <Gate
        title="Ask the archive is for archive members"
        action={{ href: '/#upload-archive', label: 'Upload your archive' }}
      >
        <p>
          Questions are open to members who have uploaded their Twitter archive.
          Your account does not have a completed upload yet, or it has opted
          out.
        </p>
        <p>
          Once your upload finishes, come back here to ask. You can still use{' '}
          <Link
            href="/search"
            className="text-brand underline-offset-2 hover:underline"
          >
            archive search
          </Link>{' '}
          in the meantime.
        </p>
      </Gate>
    )
  }

  return (
    <AgentSearch
      initialConversationId={requested}
      // A search handed over from archive search: prefilled, never sent.
      initialPrefill={askPrefillFrom(searchParams ?? {})}
      paused={!agentSearchEnabled()}
    />
  )
}
