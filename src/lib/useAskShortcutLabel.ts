'use client'

import { useEffect, useState } from 'react'

// Kept apart from askFromSearch.ts, which the Ask page's server component
// imports.

/** "⌘" on Apple platforms, "Ctrl" elsewhere; decided after hydration. */
export function useAskShortcutLabel() {
  const [label, setLabel] = useState('Ctrl')
  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform ?? navigator.platform
    if (/mac|iphone|ipad|ipod/i.test(platform)) setLabel('⌘')
  }, [])
  return label
}
