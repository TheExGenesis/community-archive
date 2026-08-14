'use client'

import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { requestFullSocialGraphRebuild } from './actions'

export function SocialGraphAdminControls() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const requestRebuild = async () => {
    setPending(true)
    setMessage(null)
    setError(null)
    try {
      const result = await requestFullSocialGraphRebuild()
      if (result.ok) setMessage(result.message)
      else setError(result.error)
    } catch {
      setError('The full refresh could not be queued.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex max-w-sm flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={requestRebuild}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-[4px] border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-950 transition-colors hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/70"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
        {pending ? 'Queueing full refresh…' : 'Run full refresh'}
      </button>
      {message ? (
        <p
          role="status"
          className="text-right text-[11px] text-emerald-700 dark:text-emerald-300"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="text-right text-[11px] text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
