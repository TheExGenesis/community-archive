'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const getHashTarget = () => {
  const hash = window.location.hash.slice(1)

  if (!hash) return null

  try {
    return document.getElementById(decodeURIComponent(hash))
  } catch {
    return document.getElementById(hash)
  }
}

export default function HashScrollHandler() {
  const pathname = usePathname()

  useEffect(() => {
    let observer: MutationObserver | undefined
    let timeout: number | undefined

    const scrollToHash = () => {
      const target = getHashTarget()

      if (!target) return false

      target.scrollIntoView({ block: 'start' })
      return true
    }

    const handleHash = () => {
      observer?.disconnect()
      if (timeout !== undefined) window.clearTimeout(timeout)

      if (!window.location.hash || scrollToHash()) return

      observer = new MutationObserver(() => {
        if (scrollToHash()) observer?.disconnect()
      })

      observer.observe(document.body, { childList: true, subtree: true })
      timeout = window.setTimeout(() => observer?.disconnect(), 2000)
    }

    handleHash()
    window.addEventListener('hashchange', handleHash)

    return () => {
      window.removeEventListener('hashchange', handleHash)
      if (timeout !== undefined) window.clearTimeout(timeout)
      observer?.disconnect()
    }
  }, [pathname])

  return null
}
