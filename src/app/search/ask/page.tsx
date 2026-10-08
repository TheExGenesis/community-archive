import type { Metadata } from 'next'
import Link from 'next/link'
import AgentSearch from '@/components/agentSearch/AgentSearch'
import { getAgentSearchViewer } from '@/lib/agentSearch/eligibility'

// Eligibility depends on the session cookie, so this page is never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ask the archive · Community Archive',
  description:
    'Members with an uploaded archive can ask questions about the community’s tweets and get answers that cite them.',
  robots: { index: false, follow: false },
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

export default async function AskTheArchivePage() {
  const access = await getAgentSearchViewer()

  if (!access.ok && access.reason === 'signed_out') {
    return (
      <Gate
        title="Ask the archive"
        action={{ href: '/login?redirect=%2Fsearch%2Fask', label: 'Sign in' }}
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

  return <AgentSearch />
}
