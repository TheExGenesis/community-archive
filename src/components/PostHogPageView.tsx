'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { capturePostHogEvent } from '@/lib/posthog'
import { analyticsRoute } from '@/lib/analyticsRoutes'

export default function PostHogPageView() {
  const pathname = usePathname()
  const previous = useRef<string | null>(null)
  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    const route = analyticsRoute(pathname)
    capturePostHogEvent(
      route.group === 'product' || route.group === 'unknown'
        ? 'product_page_viewed'
        : 'site_page_viewed',
      { page: route.page },
    )
  }, [pathname])
  return null
}
