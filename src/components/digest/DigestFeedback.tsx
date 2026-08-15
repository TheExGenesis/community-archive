'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { createBrowserClient } from '@/utils/supabase'

type Sentiment = 'helpful' | 'not_helpful'
type LoadState = 'loading' | 'signed_out' | 'ready'

export function DigestFeedback({
  digestDate,
  editionId,
}: {
  digestDate: string
  editionId: string
}) {
  const supabase = useMemo(() => createBrowserClient(), [])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [sentiment, setSentiment] = useState<Sentiment | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        setLoadState('signed_out')
        return
      }

      setUserId(user.id)
      const { data, error: readError } = await supabase
        .from('digest_feedback')
        .select('sentiment, comment')
        .eq('edition_id', editionId)
        .maybeSingle()
      if (cancelled) return

      if (readError) {
        setError('Feedback is temporarily unavailable.')
      } else if (data) {
        setSentiment(data.sentiment as Sentiment)
        setComment(data.comment ?? '')
      }
      setLoadState('ready')
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [editionId, supabase])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId || !sentiment || saving) return

    setSaving(true)
    setError(null)
    setMessage(null)
    const { error: writeError } = await supabase.from('digest_feedback').upsert(
      {
        edition_id: editionId,
        user_id: userId,
        sentiment,
        comment: comment.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'edition_id,user_id' },
    )

    if (writeError) {
      setError('Could not save feedback. Please try again.')
    } else {
      setMessage('Thanks — your feedback was saved.')
    }
    setSaving(false)
  }

  if (loadState === 'loading') {
    return (
      <section className="mt-12 border-t border-zinc-200 pt-7 text-sm text-muted-foreground dark:border-zinc-800">
        Loading feedback…
      </section>
    )
  }

  if (loadState === 'signed_out') {
    return (
      <section className="mt-12 border-t border-zinc-200 pt-7 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Help improve the Digest</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <Link
            href={`/login?redirect=${encodeURIComponent(`/digest/${digestDate}`)}`}
            className="font-semibold text-brand hover:underline"
          >
            Sign in
          </Link>{' '}
          to share private feedback with the editors.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-12 border-t border-zinc-200 pt-7 dark:border-zinc-800">
      <form onSubmit={save} className="max-w-2xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Help improve the Digest</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Was this edition useful? Your response is shared privately with
            digest editors.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={sentiment === 'helpful'}
            onClick={() => setSentiment('helpful')}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold aria-pressed:border-brand aria-pressed:bg-blue-50 aria-pressed:text-brand dark:aria-pressed:bg-blue-950"
          >
            <ThumbsUp className="h-4 w-4" aria-hidden="true" />
            Helpful
          </button>
          <button
            type="button"
            aria-pressed={sentiment === 'not_helpful'}
            onClick={() => setSentiment('not_helpful')}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold aria-pressed:border-brand aria-pressed:bg-blue-50 aria-pressed:text-brand dark:aria-pressed:bg-blue-950"
          >
            <ThumbsDown className="h-4 w-4" aria-hidden="true" />
            Not helpful
          </button>
        </div>

        <label className="block text-sm font-medium">
          What should we improve?{' '}
          <span className="font-normal">(optional)</span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={2000}
            rows={3}
            className="mt-2 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!sentiment || saving}
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save feedback'}
          </button>
          {message ? <p className="text-sm text-green-700">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </form>
    </section>
  )
}
