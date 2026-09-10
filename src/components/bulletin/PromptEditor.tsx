'use client'

import { useState } from 'react'
import Link from 'next/link'
import { savePrompt } from '@/app/admin/bulletin/actions'
import { formatTimestamp, type PromptDashboard } from '@/lib/bulletin/types'

export function PromptEditor({
  data,
  olderThan,
}: {
  data: PromptDashboard
  olderThan?: string
}) {
  const [body, setBody] = useState(data.active.body)
  const [note, setNote] = useState('')
  const [active, setActive] = useState(data.active)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const versions = data.versions.slice(0, 20)
  const bytes = new TextEncoder().encode(body).length
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const form = new FormData()
      form.set('body', body)
      form.set('note', note)
      form.set('expected_id', active.id)
      const result = await savePrompt(form)
      if (result.error) setMessage(result.error)
      else if (result.version) {
        setActive({ ...active, id: result.version, body, note })
        setNote('')
        setMessage(`Version ${result.version} saved for future runs.`)
      }
    } catch {
      setMessage('Prompt could not be saved. Your draft is still here.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <section
      id="prompts"
      className="space-y-5 rounded-lg border bg-card p-5 sm:p-6"
    >
      <div>
        <h2 className="text-xl font-semibold">Classifier prompt</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {active.id === 'legacy'
            ? 'Original prompt'
            : `Active version ${active.id}`}{' '}
          · Each run keeps the version it started with.
        </p>
      </div>
      {(data.preview_note || data.read_only) && (
        <p className="rounded-md bg-muted p-3 text-sm">
          {data.preview_note ??
            'Local admin preview is read-only. Sign in as an admin with preview disabled to save.'}
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <input type="hidden" name="expected_id" value={active.id} />
        <label className="block text-sm font-medium" htmlFor="bulletin-prompt">
          Prompt for future runs
        </label>
        <textarea
          id="bulletin-prompt"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={saving}
          required
          rows={15}
          className="w-full rounded-md border bg-background p-3 font-mono text-sm leading-6"
        />
        <p
          className={`text-xs ${bytes > 16000 ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {bytes.toLocaleString()} / 16,000 bytes. Keep the JSON fields and
          allowed values so the worker can validate responses.
        </p>
        <label
          className="block text-sm font-medium"
          htmlFor="bulletin-prompt-note"
        >
          What changed?
        </label>
        <input
          id="bulletin-prompt-note"
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={saving}
          required
          maxLength={300}
          placeholder="e.g. Exclude generic product announcements"
          className="w-full rounded-md border bg-background p-3 text-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={
              data.read_only ||
              saving ||
              bytes > 16000 ||
              !body.trim() ||
              !note.trim() ||
              body === active.body
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            type="submit"
          >
            {saving ? 'Saving…' : 'Save for future runs'}
          </button>
          <button
            type="button"
            disabled={saving}
            className="px-3 py-2 text-sm text-muted-foreground"
            onClick={() => {
              setBody(active.body)
              setNote('')
              setMessage('')
            }}
          >
            Reset draft
          </button>
        </div>
        <p role="status" className="text-sm">
          {message}
        </p>
      </form>
      <p className="text-sm leading-6 text-muted-foreground">
        Saving creates a new version immediately for the next run. It doesn’t
        restart a running job or recheck old decisions. Phrase filters, JSON
        validation, and spending limits stay in place.
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Prompt version history
        </summary>
        <div className="mt-4 space-y-3">
          {versions.map((version) => (
            <details key={version.id} className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm">
                Version {version.id} · {version.note} ·{' '}
                {formatTimestamp(version.created_at)}
              </summary>
              <p className="mt-3 text-xs text-muted-foreground">
                Saved by {version.created_by ?? 'initial setup'}
              </p>
              <pre className="my-3 whitespace-pre-wrap break-words font-mono text-xs leading-5">
                {version.body}
              </pre>
              <button
                type="button"
                disabled={saving}
                className="text-sm text-brand hover:underline"
                onClick={() => {
                  setBody(version.body)
                  setNote(`Restore version ${version.id}`)
                  setMessage(
                    'Previous version copied into the editor. Save to activate it as a new version.',
                  )
                }}
              >
                Use as draft
              </button>
            </details>
          ))}
          {!versions.length && (
            <p className="text-sm text-muted-foreground">
              No saved versions yet.
            </p>
          )}
          <nav
            className="flex justify-between text-sm text-brand"
            aria-label="Prompt history pages"
          >
            {olderThan && (
              <Link href="/admin/bulletin#prompts">Latest versions</Link>
            )}
            {data.versions.length > 20 && (
              <Link
                href={`/admin/bulletin?prompts_before=${versions[versions.length - 1].id}#prompts`}
              >
                Older versions →
              </Link>
            )}
          </nav>
        </div>
      </details>
    </section>
  )
}
