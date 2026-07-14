import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { getAuthErrorCopy } from '@/lib/authCallback'

export default function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: {
    error?: string
    error_code?: string
    error_description?: string
  }
}) {
  const copy = getAuthErrorCopy({
    error: searchParams.error,
    errorCode: searchParams.error_code,
    errorDescription: searchParams.error_description,
  })
  const supportCode = searchParams.error_code || searchParams.error

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-8 text-center shadow-lg">
        <AlertTriangle className="mx-auto mb-5 h-10 w-10 text-amber-500" />
        <h1 className="mb-3 text-3xl font-bold text-foreground">
          {copy.title}
        </h1>
        <p className="mb-8 text-muted-foreground">{copy.description}</p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="rounded-md bg-brand px-5 py-2.5 font-medium text-brand-foreground transition-colors hover:bg-brand/90"
          >
            Try signing in again
          </Link>
          <Link
            href="/"
            className="rounded-md border border-input bg-background px-5 py-2.5 font-medium text-foreground transition-colors hover:bg-accent"
          >
            Return home
          </Link>
        </div>

        {supportCode ? (
          <p className="mt-6 text-xs text-muted-foreground">
            Support code: {supportCode}
          </p>
        ) : null}
      </section>
    </main>
  )
}
