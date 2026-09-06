'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { capturePostHogEvent } from '@/lib/posthog'

type Navigation = {
  pathname: string
  startedAt: number | null
  kind: 'client' | 'history' | 'document' | 'unknown'
}
let pendingNavigation: Navigation | null = null
let activeNavigation: Navigation | null = null

function committedNavigation(pathname: string): Navigation {
  if (pendingNavigation?.pathname === pathname) {
    activeNavigation = pendingNavigation
    pendingNavigation = null
  } else if (!activeNavigation) {
    activeNavigation = { pathname, startedAt: 0, kind: 'document' }
  } else if (activeNavigation.pathname !== pathname) {
    // Programmatic navigation has no observed click start. Do not report time
    // since the document loaded as if it were a route's loading duration.
    pendingNavigation = null
    activeNavigation = { pathname, startedAt: null, kind: 'unknown' }
  }
  return activeNavigation
}

export function performancePage(pathname: string) {
  if (pathname === '/') return 'home'
  if (pathname === '/user-dir') return 'directory'
  if (pathname.startsWith('/user/')) return 'profile'
  if (pathname.startsWith('/tweets/')) return 'tweet'
  if (pathname === '/search') return 'search'
  if (pathname === '/bangers') return 'bangers'
  if (pathname === '/digest' || pathname.startsWith('/digest/')) return 'digest'
  if (pathname === '/community') return 'gallery'
  if (pathname === '/social-graph') return 'graph'
  if (pathname === '/stream') return 'stream'
  if (pathname === '/trends') return 'trends'
  if (pathname === '/research') return 'research'
  if (pathname === '/docs') return 'docs'
  return null
}

// A committed shell is distinct from usable data; section markers report the
// latter. Emit route categories only, never usernames, query text, or URLs.
export function useReportSectionReady(section: string, ready = true) {
  const pathname = usePathname()
  const reported = useRef<string | null>(null)
  useEffect(() => {
    if (!ready || !pathname) return
    const key = `${pathname}:${section}`
    if (reported.current === key) return
    const page = performancePage(pathname)
    if (!page) return
    const current = committedNavigation(pathname)
    let secondFrame = 0
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        reported.current = key
        capturePostHogEvent('website_section_ready', {
          page,
          section,
          ...(current.startedAt === null
            ? {}
            : {
                elapsed_ms: Math.round(performance.now() - current.startedAt),
              }),
          navigation_type: current.kind,
        })
      })
    })
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(secondFrame)
    }
  }, [pathname, section, ready])
}

export function SectionReady({ section }: { section: string }) {
  useReportSectionReady(section)
  return null
}

export default function PagePerformance() {
  useReportSectionReady('navigation_shell')
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const link =
        event.target instanceof Element ? event.target.closest('a[href]') : null
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.download ||
        (link.target && link.target !== '_self')
      )
        return
      const url = new URL(link.href)
      if (url.origin !== location.origin || url.pathname === location.pathname)
        return
      pendingNavigation = {
        pathname: url.pathname,
        startedAt: performance.now(),
        kind: 'client',
      }
    }
    const back = () => {
      pendingNavigation = {
        pathname: location.pathname,
        startedAt: performance.now(),
        kind: 'history',
      }
    }
    document.addEventListener('click', click, true)
    window.addEventListener('popstate', back)
    return () => {
      document.removeEventListener('click', click, true)
      window.removeEventListener('popstate', back)
    }
  }, [])
  return null
}
