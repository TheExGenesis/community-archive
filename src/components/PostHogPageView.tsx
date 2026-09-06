'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { capturePostHogEvent } from '@/lib/posthog'

const productPageForPath = (pathname: string) => {
  if (pathname === '/') return 'home'
  if (pathname === '/bangers') return 'bangers'
  if (pathname === '/digest') return 'digest'
  if (/^\/digest\/[^/]+\/[^/]+$/.test(pathname)) return 'digest_story'
  if (pathname.startsWith('/digest/')) return 'digest'
  if (pathname === '/stream') return 'live_stream'
  if (pathname === '/research') return 'research'
  if (pathname === '/search') return 'search'
  if (pathname === '/settings') return 'settings'
  if (pathname === '/trends') return 'trends'
  if (pathname === '/user-dir') return 'user_directory'
  if (pathname.startsWith('/user/')) return 'user_profile'
  return null
}

export default function PostHogPageView() {
  const pathname = usePathname()

  useEffect(() => {
    const page = productPageForPath(pathname)
    if (page) capturePostHogEvent('product_page_viewed', { page })
  }, [pathname])

  return null
}
