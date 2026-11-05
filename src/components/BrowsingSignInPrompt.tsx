import Link from 'next/link'
import { LockKeyhole } from 'lucide-react'
import { loginHref } from '@/lib/authRedirect'

export default function BrowsingSignInPrompt({
  title,
  description,
  returnTo,
}: {
  title: string
  description: string
  returnTo: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-6 py-10 text-center sm:px-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
        <LockKeyhole className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <Link
        href={loginHref(returnTo)}
        className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-brand px-6 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Log in to continue
      </Link>
    </div>
  )
}
