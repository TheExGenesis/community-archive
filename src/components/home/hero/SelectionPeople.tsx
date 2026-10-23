'use client'

import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { MapPerson, MapPeoplePage } from '@/lib/hexMap/gateway'
import { mapUrl } from '@/lib/hexMap/version'
import styles from './hero.module.css'

function PeopleList({ cells }: { cells: string }) {
  const scroll = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLButtonElement>(null)
  const query = useInfiniteQuery({
    queryKey: ['hex-selection-people-pages', cells],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<MapPeoplePage> => {
      const response = await fetch(
        mapUrl(`people?cells=${cells}&offset=${pageParam}`),
        { signal },
      )
      if (!response.ok) throw new Error('People unavailable')
      return response.json()
    },
    getNextPageParam: (page) => page.nextOffset,
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const {
    data,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = query
  useEffect(() => {
    if (
      !sentinel.current ||
      !hasNextPage ||
      isFetchingNextPage ||
      isFetchNextPageError
    )
      return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void fetchNextPage()
      },
      { root: scroll.current, rootMargin: '200px' },
    )
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [
    data,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  ])
  const people = Array.from(
    new Map(
      data?.pages
        .flatMap((page) => page.people)
        .map((person) => [person.account_id, person]),
    ).values(),
  )
  return (
    <div
      ref={scroll}
      className="min-h-0 overflow-y-auto overscroll-contain"
      aria-label="Archive members"
      aria-busy={query.isFetching}
    >
      {query.isPending ? (
        <p className="py-4" role="status">
          Loading people…
        </p>
      ) : query.isError && !data ? (
        <p className="py-4" role="alert">
          People could not load.{' '}
          <button className="underline" onClick={() => query.refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <ul className="divide-y">
          {people.map((person) => (
            <li key={person.account_id}>
              <Link
                href={`/user/${person.username}`}
                prefetch={false}
                className="flex items-center gap-3 rounded px-2 py-3 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Avatar className="h-10 w-10 shrink-0" aria-hidden="true">
                  <AvatarImage
                    src={person.avatar ?? undefined}
                    alt=""
                    loading="lazy"
                  />
                  <AvatarFallback>
                    {person.username[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 break-all">@{person.username}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && !people.length && !hasNextPage && (
        <p className="py-4">No archive members in this selection.</p>
      )}
      {hasNextPage ? (
        <button
          ref={sentinel}
          className="my-3 w-full rounded border px-4 py-2"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {isFetchingNextPage
            ? 'Loading more…'
            : isFetchNextPageError
              ? 'Retry loading more'
              : 'Load more'}
        </button>
      ) : (
        people.length > 0 && (
          <p
            className="py-3 text-center text-sm text-muted-foreground"
            role="status"
          >
            All {people.length.toLocaleString()} members loaded
          </p>
        )
      )}
    </div>
  )
}

export default function SelectionPeople({
  cells,
  preview,
  title,
}: {
  cells: string
  preview: MapPerson[]
  title: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={styles.selectionAvatars}
          aria-label="View archive members in this selection"
        >
          <span className="flex" aria-hidden="true">
            {preview.slice(0, 6).map((person) => (
              <Avatar
                key={person.account_id}
                className="-ml-1 h-6 w-6 border border-background"
              >
                <AvatarImage src={person.avatar ?? undefined} alt="" />
                <AvatarFallback>{person.username[0]}</AvatarFallback>
              </Avatar>
            ))}
          </span>
          <span className="ml-2 text-xs underline underline-offset-2">
            View members
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="grid max-h-[80dvh] w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 p-4 sm:p-6">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle>Archive members</DialogTitle>
          <DialogDescription>
            {title}. People who uploaded an archive or opted in.
          </DialogDescription>
        </DialogHeader>
        {open && <PeopleList cells={cells} />}
      </DialogContent>
    </Dialog>
  )
}
