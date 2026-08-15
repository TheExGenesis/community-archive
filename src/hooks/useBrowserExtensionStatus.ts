'use client'

import { useEffect, useState } from 'react'
import {
  getBrowserExtensionStatus,
  type BrowserExtensionStatus,
} from '@/lib/browserExtension'

export function useBrowserExtensionStatus(): BrowserExtensionStatus {
  const [status, setStatus] = useState<BrowserExtensionStatus>('checking')

  useEffect(() => {
    let active = true
    void getBrowserExtensionStatus().then((nextStatus) => {
      if (active) setStatus(nextStatus)
    })
    return () => {
      active = false
    }
  }, [])

  return status
}
