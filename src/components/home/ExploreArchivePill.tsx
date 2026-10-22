'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export default function ExploreArchivePill() {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const container = ref.current
    const hero = container?.closest('section')
    const map = document.getElementById('community-map')
    if (!container || !hero || !map) return

    const update = () => {
      // Measure the initial fold regardless of scroll position. Subtract our
      // own height so revealing the pill cannot change its visibility rule.
      const mapTop = map.getBoundingClientRect().top + window.scrollY
      const withoutPill = mapTop - container.getBoundingClientRect().height
      setShow(withoutPill >= window.innerHeight)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(hero)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div ref={ref}>
      {show && (
        <div className="pt-5">
          <Link
            href="#community-map"
            className="inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-medium text-brand-deep transition-colors hover:bg-brand/20"
          >
            Explore the archive ↓
          </Link>
        </div>
      )}
    </div>
  )
}
