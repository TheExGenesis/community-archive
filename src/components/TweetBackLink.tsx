'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function TweetBackLink({
  href,
  label,
  useHistory,
}: {
  href: string
  label: string
  useHistory: boolean
}) {
  const router = useRouter()

  return (
    <Link
      href={href}
      onClick={(event) => {
        if (!useHistory || window.history.length <= 1) return
        event.preventDefault()
        router.back()
      }}
      className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  )
}
