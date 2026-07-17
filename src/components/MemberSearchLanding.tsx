'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import {
  ArrowRight,
  Boxes,
  Search,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import UserSearchInput from '@/components/UserSearchInput'
import { formatNumber } from '@/lib/formatNumber'
import { buildSearchParams } from '@/lib/searchParams'

interface MemberSearchLandingProps {
  tweetCount: number | null
  userCount: number | null
}

const exampleSearches = [
  'open source communities',
  'AI alignment',
  'from:vitalikbuterin ethereum',
]

export default function MemberSearchLanding({
  tweetCount,
  userCount,
}: MemberSearchLandingProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const search = (expression: string) => {
    const trimmedQuery = expression.trim()
    if (!trimmedQuery) return
    const params = buildSearchParams(trimmedQuery)
    router.push(`/search?${params.toString()}`)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    search(query)
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background">
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24 lg:px-8">
        <Image
          src="/images/logo.png"
          alt=""
          width={64}
          height={64}
          className="h-14 w-14 sm:h-16 sm:w-16"
          priority
        />
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-brand">
          Member archive access
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          What are you looking for?
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          Search {formatNumber(tweetCount)} public tweets from{' '}
          {formatNumber(userCount)} participating members.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-10 flex w-full max-w-3xl flex-col gap-3 rounded-xl border border-border bg-card p-2 shadow-lg sm:flex-row"
        >
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <UserSearchInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search the Community Archive"
              aria-label="Search the Community Archive"
              className="h-14 border-0 bg-transparent pl-12 pr-4 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-lg"
              autoFocus
              autoComplete="off"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={!query.trim()}
            className="h-14 bg-green-600 px-7 text-white hover:bg-green-700 dark:bg-green-400 dark:text-green-950 dark:hover:bg-green-300"
          >
            Search
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>

        <div className="mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-2 text-sm text-muted-foreground">
          <span>Try:</span>
          {exampleSearches.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => search(example)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-foreground transition-colors hover:bg-accent"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="mt-14 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
          <Link
            href="/search"
            className="group rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent"
          >
            <SlidersHorizontal className="h-5 w-5 text-brand" />
            <h2 className="mt-4 text-base font-semibold text-foreground">
              Advanced search
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Filter by author, reply, or date.
            </p>
          </Link>
          <Link
            href="/user-dir"
            className="group rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent"
          >
            <Users className="h-5 w-5 text-brand" />
            <h2 className="mt-4 text-base font-semibold text-foreground">
              Library
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Browse the archive by contributor.
            </p>
          </Link>
          <Link
            href="/#products"
            className="group rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent"
          >
            <Boxes className="h-5 w-5 text-brand" />
            <h2 className="mt-4 text-base font-semibold text-foreground">
              Tools
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Explore tools built on the archive.
            </p>
          </Link>
        </div>
      </section>
    </main>
  )
}
