'use client'

import { useId, useState, type FormEvent } from 'react'
import {
  OWN_KEY_ERRORS,
  OWN_KEY_HEADER,
  OWN_KEY_LIMIT_MULTIPLIER,
  type OwnKeyError,
} from '@/lib/agentSearch/ownKey'
import { readOwnKey, useOwnKey } from './ownKeyStore'

const BUTTON =
  'inline-flex h-8 shrink-0 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

/** What a check refusal means, in the member's terms. */
export function ownKeyMessage(code: string | undefined): string {
  return code && code in OWN_KEY_ERRORS
    ? OWN_KEY_ERRORS[code as OwnKeyError]
    : 'The key could not be checked. Try again in a minute.'
}

/**
 * The message for a question the start route refused over the member's own
 * key, or null when the refusal was about something else. The transport's
 * error reads "Failed to fetch chat: <status> <body>".
 */
export function ownKeyRefusalMessage(error: Error | undefined): string | null {
  const code = error?.message.match(/\bown_key_[a-z_]+/)?.[0]
  if (!code) return null
  const fixable =
    code === 'own_key_invalid' ||
    code === 'own_key_no_credit' ||
    code === 'own_key_refused'
  return fixable
    ? `${ownKeyMessage(code)} Fix it on OpenRouter, or remove the key to ask on today’s house questions.`
    : ownKeyMessage(code)
}

/**
 * Adds, shows and removes the member's own OpenRouter key. A key is checked
 * with OpenRouter (through our server, which keeps nothing) before it is
 * saved in this browser.
 */
export function OwnKeyControl({
  ownLimit,
}: {
  /** Questions a day on one's own key, when the page knows it. */
  ownLimit?: number | null
}) {
  const [hasKey, setKey] = useOwnKey()
  const [draft, setDraft] = useState('')
  const [checking, setChecking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const inputId = useId()
  const noteId = useId()
  const limitText = ownLimit
    ? `up to ${ownLimit.toLocaleString('en-US')} questions a day`
    : `${OWN_KEY_LIMIT_MULTIPLIER} times as many questions a day`

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const key = draft.trim()
    if (!key || checking) return
    setChecking(true)
    setProblem(null)
    try {
      const response = await fetch('/api/agent-search/key', {
        method: 'POST',
        headers: { [OWN_KEY_HEADER]: key },
        cache: 'no-store',
      })
      const body = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      if (!response.ok) {
        setProblem(ownKeyMessage(body?.error))
        return
      }
      setKey(key)
      setDraft('')
    } catch {
      setProblem(ownKeyMessage(undefined))
    } finally {
      setChecking(false)
    }
  }

  if (hasKey) {
    const ending = readOwnKey()?.slice(-4)
    return (
      <div className="space-y-2 text-sm">
        <p className="text-foreground">
          Your OpenRouter key{ending ? ` ending ${ending}` : ''} pays for your
          questions: {limitText}.
        </p>
        <button
          type="button"
          onClick={() => setKey(null)}
          className={`${BUTTON} border border-border text-foreground hover:bg-accent`}
        >
          Remove key
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={save} className="space-y-2 text-sm">
      <label htmlFor={inputId} className="block text-foreground">
        Pay for your questions with your own OpenRouter key and ask {limitText}.
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="sk-or-…"
          aria-describedby={noteId}
          className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2.5 py-1.5 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={!draft.trim() || checking}
          className={`${BUTTON} bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          {checking ? 'Checking…' : 'Save'}
        </button>
      </div>
      {problem && (
        <p role="alert" className="text-destructive">
          {problem}
        </p>
      )}
      <p id={noteId} className="text-xs text-muted-foreground">
        The key stays in this browser. It goes with each question to OpenRouter,
        and our server never stores it.
      </p>
    </form>
  )
}
