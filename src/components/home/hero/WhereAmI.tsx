'use client'
import { usePreviewSession } from '@/components/PreviewSession'
import type { MapLookup } from '@/lib/hexMap/gateway'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { createBrowserClient } from '@/utils/supabase'
import { OptInDisclosure, useCommunityOptIn } from '@/components/CommunityOptIn'
import { mapUrl } from '@/lib/hexMap/version'
import styles from './hero.module.css'
import { parseMapUsernames } from '@/lib/hexMap/usernames'

export type SelfLocation = { username: string; cell: number }
type Result = {
  status?: 'sign_in' | 'opt_in' | 'not_mapped' | 'located'
  username?: string
  error?: string
  isSelf?: boolean
  person?: SelfLocation
  people?: SelfLocation[]
  missing?: string[]
}

export default function WhereAmI({
  onLocated,
  onClear,
}: {
  onLocated: (people: SelfLocation[]) => void
  onClear?: () => void
}) {
  const { enabled: previewEnabled, view, optedIn } = usePreviewSession()
  const optIn = useCommunityOptIn()
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
    setName('')
    callback.current([])
  }, [cancel])

  const locate = useCallback(
    async (query = '') => {
      const names = query.trim() ? parseMapUsernames(query) : []
      if (!names) {
        clear()
        setResult({
          error: 'Enter up to 20 valid X usernames, separated by commas.',
        })
        return
      }
      const simulated = previewEnabled && view !== 'actual'
      if (simulated && !optedIn) {
        cancel()
        setBusy(false)
        callback.current([])
        setResult(
          view === 'signed-out'
            ? {
                status: 'sign_in',
                error: 'Opt in with Twitter to find yourself on the map.',
              }
            : {
                status: 'opt_in',
                username: 'preview_user',
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
      callback.current([])
      try {
        const response = await fetch(
          mapUrl(
            `${simulated ? 'lookup' : 'me'}?name=${encodeURIComponent(simulated ? names.join(',') || 'exgenesis' : names.join(','))}`,
          ),
          { signal: controller.signal, cache: 'no-store' },
        )
        const payload = await response.json()
        const people = simulated ? ((payload as MapLookup).people ?? []) : []
        const data: Result =
          simulated && response.ok
            ? people.length
              ? {
                  status: 'located',
                  people: people.map(({ username, cell }) => ({
                    username,
                    cell,
                  })),
                  missing: names.filter(
                    (name) =>
                      !people.some((p) => p.username.toLowerCase() === name),
                  ),
                  isSelf: false,
                }
              : {
                  status: 'not_mapped',
                  error: 'This username is not available on the map.',
                }
            : payload
        if (request !== generation.current) return
        const located = data.people ?? (data.person ? [data.person] : [])
        if (response.ok && data.status === 'located' && located.length) {
          callback.current(located)
          setName(
            names.length
              ? names.map((name) => `@${name}`).join(', ')
              : `@${located[0].username}`,
          )
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
    [previewEnabled, view, optedIn, cancel, clear],
  )

  useEffect(() => {
    if (!previewEnabled) return
    clear()
    setCanSearch(false)
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
    const params = new URLSearchParams(window.location.search)
    if (params.get('findme') === '1' && params.get('action') !== 'optin')
      void locate()
    return () => {
      subscription.unsubscribe()
      cancel()
    }
  }, [clear, locate, cancel])

  useEffect(() => {
    if (optIn.completed) void locate(name)
    // Run once when the shared opt-in completes, retaining the searched name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optIn.completed])

  return (
    <div className={styles.finder}>
      <form
        role="search"
        aria-label={
          canSearch ? 'Find usernames on the map' : 'Find yourself on the map'
        }
        className={styles.finderForm}
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) void locate(name)
        }}
      >
        <input
          aria-label={canSearch ? 'Find usernames' : 'Where am I?'}
          placeholder={
            canSearch ? 'Usernames, comma separated…' : 'Where am I?'
          }
          value={name}
          maxLength={358}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" aria-label="Find me on the map" disabled={busy}>
          <Search size={17} aria-hidden="true" />
        </button>
      </form>
      <button
        type="button"
        className={styles.defaultLabelsControl}
        onClick={() => {
          clear()
          onClear?.()
        }}
      >
        Clear usernames
      </button>
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
            {busy || optIn.busy
              ? result?.status === 'sign_in'
                ? 'Opening Twitter…'
                : 'Finding your place…'
              : result?.status === 'located'
                ? result.people
                  ? `${result.people.map((p) => `@${p.username}`).join(', ')} ${result.people.length === 1 ? 'is' : 'are'} here.`
                  : result.isSelf === false
                    ? `@${result.person?.username} is here.`
                    : `You are here, @${result.person?.username}.`
                : result?.status === 'sign_in' || result?.status === 'opt_in'
                  ? 'Opt in to the Community Archive to find yourself on the map!'
                  : result?.error}
          </div>
          {!!result?.missing?.length && (
            <p>
              Not found on the map:{' '}
              {result.missing.map((name) => `@${name}`).join(', ')}.
            </p>
          )}
          {!busy &&
            !optIn.busy &&
            (result?.status === 'sign_in' || result?.status === 'opt_in') && (
              <>
                <OptInDisclosure />
                {optIn.error && <p role="alert">{optIn.error}</p>}
                <button
                  type="button"
                  onClick={() => void optIn.confirm(true)}
                  className={styles.finderAction}
                >
                  Opt In
                </button>
              </>
            )}
        </div>
      )}
    </div>
  )
}
