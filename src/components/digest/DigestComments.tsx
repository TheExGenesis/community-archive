'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'

const MAX_COMMENT_LENGTH = 2000

export interface DigestComment {
  id: string
  content: string
  username: string | null
  displayName: string | null
  createdAt: string
  isOwn: boolean
}

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const commenterLabel = (comment: DigestComment) =>
  comment.displayName ?? (comment.username ? `@${comment.username}` : 'Reader')

export function DigestComments({
  editionId,
  initialCount = 0,
  isSignedIn = false,
}: {
  editionId: string
  initialCount?: number
  isSignedIn?: boolean
}) {
  const [comments, setComments] = useState<DigestComment[] | null>(null)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The ISR-cached page renders shared props, so the viewer's real signed-in
  // state comes from the API response instead.
  const [signedIn, setSignedIn] = useState(isSignedIn)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/digest/${editionId}/comments`)
      if (!response.ok)
        throw new Error(`Comment request failed: ${response.status}`)
      const data = (await response.json()) as {
        comments: DigestComment[]
        signedIn?: boolean
      }
      setComments(data.comments)
      if (typeof data.signedIn === 'boolean') setSignedIn(data.signedIn)
    } catch (loadError) {
      console.error(loadError)
      setComments([])
    }
  }, [editionId])

  // The digest pages revalidate every 5 minutes, so the list is always fetched
  // client-side to avoid rendering a stale thread.
  useEffect(() => {
    void load()
  }, [load])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || pending) return

    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/digest/${editionId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!response.ok)
        throw new Error(`Comment request failed: ${response.status}`)
      const data = (await response.json()) as { comment: DigestComment }
      setComments((current) => [...(current ?? []), data.comment])
      setDraft('')
    } catch (submitError) {
      console.error(submitError)
      setError('Could not post your comment. Please try again.')
    } finally {
      setPending(false)
    }
  }

  const remove = async (commentId: string) => {
    const previous = comments
    setComments((current) =>
      (current ?? []).filter((comment) => comment.id !== commentId),
    )
    try {
      const response = await fetch(
        `/api/digest/${editionId}/comments/${commentId}`,
        { method: 'DELETE' },
      )
      if (!response.ok)
        throw new Error(`Delete request failed: ${response.status}`)
    } catch (deleteError) {
      console.error(deleteError)
      setComments(previous)
      setError('Could not delete your comment. Please try again.')
    }
  }

  const count = comments?.length ?? initialCount

  return (
    <section
      aria-labelledby="digest-comments-heading"
      className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800"
    >
      <h2
        id="digest-comments-heading"
        className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400"
      >
        {count === 1 ? '1 Comment' : `${count} Comments`}
      </h2>

      <ul className="mt-4 space-y-4">
        {(comments ?? []).map((comment) => (
          <li
            key={comment.id}
            className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {commenterLabel(comment)}
                <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  {formatDate(comment.createdAt)}
                </span>
              </div>
              {comment.isOwn ? (
                <button
                  type="button"
                  onClick={() => remove(comment.id)}
                  aria-label="Delete comment"
                  title="Delete comment"
                  className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {comment.content}
            </p>
          </li>
        ))}
      </ul>

      {comments !== null && comments.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          No comments yet.
        </p>
      ) : null}

      {signedIn ? (
        <form onSubmit={submit} className="mt-5">
          <label htmlFor="digest-comment-input" className="sr-only">
            Add a comment
          </label>
          <textarea
            id="digest-comment-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_COMMENT_LENGTH}
            rows={3}
            placeholder="Add a comment"
            className="w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <div className="mt-2 flex items-center justify-end gap-3">
            {error ? (
              <span className="mr-auto text-sm text-red-600 dark:text-red-400">
                {error}
              </span>
            ) : null}
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="rounded-full bg-brand px-4 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">
          Sign in to comment
        </p>
      )}
    </section>
  )
}
