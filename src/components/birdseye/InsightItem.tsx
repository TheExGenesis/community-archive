'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Link2, UserRound } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { EvidenceItem } from '@/lib/community-apps/types'

export function InsightItem({
  item,
  username,
  avatar,
}: {
  item: EvidenceItem
  username: string | null
  avatar?: string
}) {
  const [open, setOpen] = useState(false)
  const pinned = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const enter = () => {
    clearTimeout(timer.current)
    setOpen(true)
  }
  const leave = () => {
    if (!pinned.current) timer.current = setTimeout(() => setOpen(false), 180)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        pinned.current = next
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <button
          onClick={(event) => {
            event.preventDefault()
            clearTimeout(timer.current)
            pinned.current = !pinned.current
            setOpen(pinned.current)
          }}
          onMouseEnter={enter}
          onMouseLeave={leave}
          className="min-h-10 flex w-full items-center gap-2 rounded-lg bg-muted/35 px-2.5 py-2 text-left text-xs font-medium hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {username && (
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarImage src={avatar} alt="" />
              <AvatarFallback>
                <UserRound size={12} />
              </AvatarFallback>
            </Avatar>
          )}
          <span className="line-clamp-2">
            {username ? `@${username}` : item.label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={item.label}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="ph-no-capture ph-mask w-72 p-3"
      >
        <p className="font-sans text-sm font-semibold">
          {username ? (
            <Link href={`/user/${username}`} className="text-brand">
              @{username}
            </Link>
          ) : (
            item.label
          )}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {item.description}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {Array.from(new Set(item.tweetIds)).map((id, i) => (
            <Link
              key={id}
              prefetch={false}
              href={`/tweets/${id}`}
              aria-label={`Source ${i + 1} for ${item.label}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-brand hover:bg-brand/10"
            >
              <Link2 size={13} />
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
