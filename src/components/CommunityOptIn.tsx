'use client'

import Link from 'next/link'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { usePreviewSession } from '@/components/PreviewSession'
import { createBrowserClient } from '@/utils/supabase'
import { getAccountIdentity } from '@/lib/twitterIdentity'
import { updateOptIn } from '@/lib/optInApi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const INTENT_KEY = 'community-archive-opt-in'
const MAX_INTENT_AGE = 30 * 60 * 1000
const THANKS = 'Thanks for opting in to the Community Archive!'
export function OptInDisclosure() {
  return (
    <p>
      This lets us keep and share your public tweets. You can always opt out
      later. By opting in, you agree to our{' '}
      <Link
        href="/data-policy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        <strong>Data Policy</strong>
      </Link>
      .
    </p>
  )
}
const OptInContext = createContext({
  open: (_findMe = false) => {},
  confirm: async (_findMe = false) => {},
  busy: false,
  completed: false,
  error: null as string | null,
})
export const useCommunityOptIn = () => useContext(OptInContext)

export function CommunityOptInProvider({ children }: { children: ReactNode }) {
  const preview = usePreviewSession()
  const router = useRouter()
  const [dialog, setDialog] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const resumed = useRef(false)

  useEffect(() => {
    setCompleted(false)
    setError(null)
  }, [preview.view])

  const saveConsent = async () => {
    const {
      data: { session },
      error: sessionError,
    } = await createBrowserClient().auth.getSession()
    if (sessionError) throw sessionError
    if (!session?.user) return false
    const { username } = getAccountIdentity(session.user)
    if (!username)
      throw new Error(
        'Your Twitter username is unavailable. Please sign in again.',
      )
    await updateOptIn({ username, optedIn: true, termsVersion: 'v1.0' })
    return true
  }

  const confirm = async (findMe = false) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      if (preview.enabled) {
        preview.completeOptIn()
        setDialog(null)
        // The shared session update also updates the account menu and hero.
        return
      }
      if (await saveConsent()) {
        setCompleted(true)
        setDialog(null)
        router.refresh()
        return
      }
      // A return URL alone is not consent. Retain the explicit button action
      // in this browser tab, with an expiry, before leaving for OAuth.
      sessionStorage.setItem(INTENT_KEY, JSON.stringify({ at: Date.now() }))
      const next = findMe ? '/?action=optin&findme=1' : '/?action=optin'
      const { error: oauthError } =
        await createBrowserClient().auth.signInWithOAuth({
          provider: 'twitter',
          options: {
            redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
          },
        })
      if (oauthError) throw oauthError
    } catch (cause) {
      sessionStorage.removeItem(INTENT_KEY)
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not opt in. Please try again.',
      )
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  useEffect(() => {
    if (
      preview.enabled ||
      resumed.current ||
      new URLSearchParams(window.location.search).get('action') !== 'optin'
    )
      return
    resumed.current = true
    let intent: { at?: number } | null = null
    try {
      intent = JSON.parse(sessionStorage.getItem(INTENT_KEY) || 'null')
    } catch {
      /* Invalid or missing intent never grants consent. */
    }
    if (
      !intent?.at ||
      Date.now() - intent.at > MAX_INTENT_AGE ||
      intent.at > Date.now()
    )
      return
    inFlight.current = true
    setBusy(true)
    void saveConsent()
      .then((saved) => {
        if (!saved) throw new Error('Please sign in again to finish opting in.')
        sessionStorage.removeItem(INTENT_KEY)
        setCompleted(true)
        const next = new URL(window.location.href)
        next.searchParams.delete('action')
        router.replace(`${next.pathname}${next.search}`)
        router.refresh()
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not finish opting in. Please try again.',
        )
        setDialog(
          new URLSearchParams(window.location.search).get('findme') === '1',
        )
      })
      .finally(() => {
        inFlight.current = false
        setBusy(false)
      })
    // Resume once per OAuth return, never on a rerender or a query URL alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.enabled, router])

  const thanked = completed || (preview.enabled && preview.optedIn)
  return (
    <OptInContext.Provider
      value={{
        open: (findMe = false) => {
          setError(null)
          setDialog(findMe)
        },
        confirm,
        busy,
        completed: thanked,
        error,
      }}
    >
      {thanked && (
        <div
          role="status"
          className="border-b bg-brand/10 px-4 py-3 text-center"
        >
          {THANKS}
        </div>
      )}
      {children}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null)
        }}
      >
        <DialogContent>
          <DialogTitle>
            Opt in to the Community Archive to find yourself on the map!
          </DialogTitle>
          <DialogDescription asChild>
            <div>
              <OptInDisclosure />
            </div>
          </DialogDescription>
          {preview.enabled && (
            <p className="text-xs text-muted-foreground">
              Development simulation · no login or consent is saved
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={busy}
            onClick={() => void confirm(dialog === true)}
          >
            {busy ? 'Processing…' : 'Opt In'}
          </Button>
        </DialogContent>
      </Dialog>
    </OptInContext.Provider>
  )
}
