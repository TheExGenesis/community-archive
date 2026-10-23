'use client'
import Link from 'next/link'
import { usePreviewSession } from '@/components/PreviewSession'
import type { MapLookup } from '@/lib/hexMap/gateway'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { createBrowserClient } from '@/utils/supabase'
import { updateOptIn } from '@/lib/optInApi'
import { mapUrl } from '@/lib/hexMap/version'
import styles from './hero.module.css'

export type SelfLocation = { username: string; cell: number }
type Result = {
  status?: 'sign_in' | 'opt_in' | 'not_mapped' | 'located'
  username?: string
  error?: string
  isSelf?: boolean
  person?: SelfLocation
}

export default function WhereAmI({
  onLocated,
}: {
  onLocated: (person: SelfLocation | null) => void
}) {
  const { enabled: previewEnabled, view, setView } = usePreviewSession()
  const simulatedConsent = useRef(false)
  const [canSearch, setCanSearch] = useState(false)
  const [name, setName] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const callback = useRef(onLocated)
  callback.current = onLocated

  const cancel = useCallback(() => {
    generation.current++
    pending.current?.abort()
  }, [])
  const clear = useCallback(() => {
    cancel()
    setBusy(false)
    setResult(null)
    callback.current(null)
  }, [cancel])

  const locate = useCallback(
    async (query = '') => {
      const simulated = previewEnabled && view !== 'actual'
      if (simulated && (view === 'signed-out' || !simulatedConsent.current)) {
        cancel()
        setBusy(false)
        callback.current(null)
        setResult(
          view === 'signed-out'
            ? {
                status: 'sign_in',
                error: 'Opt in with Twitter to find yourself on the map.',
              }
            : {
                status: 'opt_in',
                username: 'preview_user',
                error: 'Signed in (simulation). Opt in to continue.',
              },
        )
        return
      }
      pending.current?.abort()
      const controller = new AbortController()
      pending.current = controller
      const request = ++generation.current
      setBusy(true)
      setResult(null)
      callback.current(null)
      try {
        const response = await fetch(
          mapUrl(
            `${simulated ? 'lookup' : 'me'}?name=${encodeURIComponent(simulated ? query.trim().replace(/^@/, '') || 'exgenesis' : query)}`,
          ),
          { signal: controller.signal, cache: 'no-store' },
        )
        const payload = await response.json()
        const person = simulated ? (payload as MapLookup).people?.[0] : null
        const data: Result =
          simulated && response.ok
            ? person
              ? {
                  status: 'located',
                  person: { username: person.username, cell: person.cell },
                  isSelf: false,
                }
              : {
                  status: 'not_mapped',
                  error: 'This username is not available on the map.',
                }
            : payload
        if (request !== generation.current) return
        if (response.ok && data.status === 'located' && data.person) {
          callback.current(data.person)
          setName(`@${data.person.username}`)
          setCanSearch(true)
        }
        setResult(data)
      } catch {
        if (request === generation.current && !controller.signal.aborted)
          setResult({
            error: 'Could not find your location. Please try again.',
          })
      } finally {
        if (request === generation.current) setBusy(false)
      }
    },
    [previewEnabled, view, cancel],
  )

  useEffect(() => {
    if (!previewEnabled) return
    clear()
    setCanSearch(false)
    simulatedConsent.current = false
    if (view === 'signed-in')
      setResult({
        status: 'opt_in',
        username: 'preview_user',
        error: 'Signed in (simulation). Opt in to continue.',
      })
  }, [previewEnabled, view, clear])

  useEffect(() => {
    let account: string | null | undefined
    const {
      data: { subscription },
    } = createBrowserClient().auth.onAuthStateChange((event, session) => {
      const next = session?.user.id ?? null
      if (
        event === 'SIGNED_OUT' ||
        (account !== undefined && account !== next)
      ) {
        clear()
        setCanSearch(false)
        setName('')
      }
      account = next
    })
    if (new URLSearchParams(window.location.search).get('findme') === '1')
      void locate()
    return () => {
      subscription.unsubscribe()
      cancel()
    }
  }, [clear, locate, cancel])

  const authenticate = async () => {
    if (busy) return
    if (previewEnabled) {
      setView('signed-in')
      return
    }
    const request = ++generation.current
    setBusy(true)
    try {
      const { error } = await createBrowserClient().auth.signInWithOAuth({
        provider: 'twitter',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent('/?findme=1')}`,
        },
      })
      if (error) throw error
    } catch {
      if (request === generation.current) {
        setResult({
          status: 'sign_in',
          error: 'Could not connect to Twitter. Please try again.',
        })
        setBusy(false)
      }
    }
  }

  const optIn = async () => {
    if (!result?.username || busy) return
    if (previewEnabled && view === 'signed-in') {
      simulatedConsent.current = true
      setCanSearch(true)
      await locate(name)
      return
    }
    const request = ++generation.current
    setBusy(true)
    try {
      await updateOptIn({
        username: result.username,
        optedIn: true,
        termsVersion: 'v1.0',
      })
      if (request === generation.current) await locate(name)
    } catch (error) {
      if (request === generation.current) {
        setResult({
          ...result,
          error:
            error instanceof Error
              ? error.message
              : 'Could not update consent. Please try again.',
        })
        setBusy(false)
      }
    }
  }

  return (
    <div className={styles.finder}>
      <form
        role="search"
        aria-label={
          canSearch ? 'Find a username on the map' : 'Find yourself on the map'
        }
        className={styles.finderForm}
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) void locate(name)
        }}
      >
        <input
          aria-label={canSearch ? 'Find username' : 'Where am I?'}
          placeholder={canSearch ? 'Find any username…' : 'Where am I?'}
          value={name}
          maxLength={16}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" aria-label="Find me on the map" disabled={busy}>
          <Search size={17} aria-hidden="true" />
        </button>
      </form>
      {previewEnabled && view !== 'actual' && (
        <p className="text-xs text-muted-foreground">
          Simulation · no login or consent saved
        </p>
      )}
      {(busy || result) && (
        <div className={styles.finderMessage}>
          <button
            type="button"
            className={styles.finderClose}
            aria-label="Close location message"
            onClick={clear}
          >
            <X size={14} aria-hidden="true" />
          </button>
          <div role="status" aria-live="polite">
            {busy
              ? result?.status === 'sign_in'
                ? 'Opening Twitter…'
                : 'Finding your place…'
              : result?.status === 'located'
                ? result.isSelf === false
                  ? `@${result.person?.username} is here.`
                  : `You are here, @${result.person?.username}.`
                : result?.error}
          </div>
          {!busy && result?.status === 'sign_in' && (
            <button
              type="button"
              onClick={() => void authenticate()}
              className={styles.finderAction}
            >
              Opt In
            </button>
          )}
          {!busy && result?.status === 'opt_in' && (
            <>
              <p>
                Opting in lets Community Archive collect and share your public
                tweets. They may persist after deletion from X. By opting in,
                you agree to our{' '}
                <Link
                  href="/data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Data Policy
                </Link>
                .
              </p>
              <button
                type="button"
                className={styles.finderAction}
                onClick={() => void optIn()}
              >
                Opt in and find me
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
