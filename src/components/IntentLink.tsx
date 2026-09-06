'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, type ComponentProps } from 'react'

/** Expensive destinations prefetch on hover/focus, never just on visibility. */
export default function IntentLink({
  href,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & { href: string }) {
  const router = useRouter()
  const prefetched = useRef<string | null>(null)
  const prefetch = () => {
    if (prefetched.current === href) return
    prefetched.current = href
    router.prefetch(href)
  }
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onMouseEnter={(event) => {
        prefetch()
        props.onMouseEnter?.(event)
      }}
      onFocus={(event) => {
        prefetch()
        props.onFocus?.(event)
      }}
    >
      {children}
    </Link>
  )
}
