'use client'
import Link from 'next/link'
export default function AppDataError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-bold">
        This collection is temporarily unavailable
      </h1>
      <p className="my-4 text-muted-foreground">
        We couldn’t load the saved analysis. Please try again.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-brand px-4 py-2 font-semibold text-brand-foreground"
      >
        Try again
      </button>
      <Link href="/community" className="ml-5 text-brand">
        Community Apps
      </Link>
    </main>
  )
}
