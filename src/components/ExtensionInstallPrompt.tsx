'use client'

import { useEffect, useState } from 'react'
import { Puzzle, X } from 'lucide-react'
import { useBrowserExtensionStatus } from '@/hooks/useBrowserExtensionStatus'
import { CHROME_EXTENSION_URL } from '@/lib/browserExtension'

export type ExtensionInstallSurface =
  | 'home'
  | 'stream'
  | 'stream-monitor'
  | 'trends'

const PROMPT_DISMISSED_KEY = 'browser-extension-prompt-dismissed-at:v1'
const DISMISSAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000

const copy: Record<ExtensionInstallSurface, string> = {
  home: 'Keep the archive current between uploads. Contribute public tweets as you browse X.',
  stream:
    'Help keep this stream moving by contributing public tweets as you browse X.',
  'stream-monitor':
    'Help grow the archive by contributing public tweets as you browse X.',
  trends:
    'Want fresher trend data? Help capture new public tweets as you browse X.',
}

export default function ExtensionInstallPrompt({
  surface,
  className = '',
}: {
  surface: ExtensionInstallSurface
  className?: string
}) {
  const extensionStatus = useBrowserExtensionStatus()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      const dismissedAt = Number(localStorage.getItem(PROMPT_DISMISSED_KEY))
      const dismissalIsCurrent =
        Number.isFinite(dismissedAt) &&
        Date.now() - dismissedAt < DISMISSAL_DURATION_MS

      if (!dismissalIsCurrent) {
        localStorage.removeItem(PROMPT_DISMISSED_KEY)
      }
      setDismissed(dismissalIsCurrent)
    } catch {
      setDismissed(false)
    }
  }, [])

  if (extensionStatus !== 'not-installed' || dismissed) return null

  const dismiss = () => {
    try {
      localStorage.setItem(PROMPT_DISMISSED_KEY, Date.now().toString())
    } catch {
      // The suggestion can still be dismissed for this page view when browser
      // storage is unavailable.
    }
    setDismissed(true)
  }

  return (
    <aside
      aria-label="Browser extension"
      className={`dark:bg-[#121214]/85 flex items-center gap-3 rounded-[6px] border border-zinc-200 bg-white/80 px-3.5 py-2.5 text-[12.5px] text-zinc-700 shadow-sm dark:border-[#2a2a2e] dark:text-zinc-300 ${className}`}
    >
      <Puzzle className="h-4 w-4 flex-none text-brand" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-relaxed">
        {copy[surface]}{' '}
        <a
          href={CHROME_EXTENSION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="whitespace-nowrap font-bold text-brand"
        >
          Install the browser extension ↗
        </a>
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="flex h-7 w-7 flex-none items-center justify-center rounded-[4px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Hide browser extension suggestion</span>
      </button>
    </aside>
  )
}
