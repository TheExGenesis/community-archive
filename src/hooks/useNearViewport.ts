'use client'

import { useEffect, useRef, useState } from 'react'

/** Once visible, retain the mounted feature as the user scrolls away. */
export function useNearViewport(rootMargin = '200px') {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const target = ref.current
    if (!target || visible) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [rootMargin, visible])
  return { ref, visible }
}
