'use client'
import { useEffect } from 'react'

/** Run after the router's scroll handling, which can otherwise retain a deep
 * list/minimap position when moving between similarly shaped strand pages. */
export function StrandEntry({ seedId }: { seedId: string }) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => window.scrollTo(0, 0))
    return () => cancelAnimationFrame(frame)
  }, [seedId])
  return null
}
