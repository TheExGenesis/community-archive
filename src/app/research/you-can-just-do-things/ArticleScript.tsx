'use client'

import { useEffect } from 'react'

// The article's charts, maps and tweet cards are drawn by one generated
// module. It runs on every mount, so navigating back to the page inside the
// site redraws them, and it removes its page-level listeners on the way out.
export default function ArticleScript() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.ycjdt')
    if (!root) return
    let active = true
    let cleanup: (() => void) | undefined
    void import('./drawArticle').then((module) => {
      if (active) cleanup = module.default(root)
    })
    return () => {
      active = false
      cleanup?.()
    }
  }, [])
  return null
}
