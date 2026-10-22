'use client'

import { useState } from 'react'
import { CopyButton } from '@/components/copy-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// Mirrors src/lib/publicApiKeys.ts, which is server-only.
type KeySummary = {
  id: string
  label: string | null
  requests_per_minute: number
  requests_per_day: number
  created_at: string
  expires_at: string | null
  last_used_at: string | null
  revoked_at: string | null
}

const MAX_ACTIVE_KEYS = 5
const LABEL_MAX_LENGTH = 80
const MIGRATION_GUIDE_URL =
  'https://github.com/TheExGenesis/community-archive/blob/main/docs/api-v1-migration.md'

const dateFormat = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDate(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) : 'Never'
}

function keyStatus(key: KeySummary, now = Date.now()) {
  if (key.revoked_at) return 'Revoked'
  if (key.expires_at && Date.parse(key.expires_at) <= now) return 'Expired'
  return 'Active'
}

async function requestJson(input: string, init: RequestInit) {
  const response = await fetch(input, init)
  const body = (await response.json().catch(() => null)) as {
    error?: string
    key?: KeySummary & { key: string }
    keys?: KeySummary[]
  } | null
  if (!response.ok) {
    throw new Error(body?.error ?? 'Something went wrong. Please try again.')
  }
  return body
}

export function ApiKeysManager({
  initialKeys,
  initialError,
  baseUrl,
}: {
  initialKeys: KeySummary[]
  initialError: string | null
  baseUrl: string
}) {
  const [keys, setKeys] = useState(initialKeys)
  const [label, setLabel] = useState('')
  const [created, setCreated] = useState<(KeySummary & { key: string }) | null>(
    null,
  )
  const [revoking, setRevoking] = useState<KeySummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError)

  const activeCount = keys.filter((key) => keyStatus(key) === 'Active').length
  const atLimit = activeCount >= MAX_ACTIVE_KEYS

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const createKey = () =>
    run(async () => {
      const body = await requestJson('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      if (!body?.key) throw new Error('The key was not created.')
      const { key, ...summary } = body.key
      setCreated({ ...summary, key })
      setKeys((current) => [summary, ...current])
      setLabel('')
    })

  const revokeKey = (target: KeySummary) =>
    run(async () => {
      await requestJson(
        `/api/settings/api-keys/${encodeURIComponent(target.id)}`,
        { method: 'DELETE' },
      )
      const revokedAt = new Date().toISOString()
      setKeys((current) =>
        current.map((key) =>
          key.id === target.id ? { ...key, revoked_at: revokedAt } : key,
        ),
      )
      if (created?.id === target.id) setCreated(null)
      setRevoking(null)
    })

  const curlExample = created
    ? `curl -H "Authorization: Bearer ${created.key}" \\\n  "${baseUrl}/accounts/jack/tweets?limit=5"`
    : ''

  return (
    <div className="mt-8 space-y-8">
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {created ? (
        <section
          className="rounded-lg border border-primary/40 bg-card p-6"
          aria-live="polite"
        >
          <h2 className="text-lg font-semibold">Copy your new key now</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This is the only time the full key is shown. Store it somewhere
            safe, like your server&apos;s environment variables.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {created.key}
            </code>
            <CopyButton textToCopy={created.key} />
          </div>
          <p className="mt-4 text-sm font-medium">Try it</p>
          <div className="mt-2 flex items-start gap-2">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs">
              {curlExample}
            </pre>
            <CopyButton textToCopy={curlExample} />
          </div>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => setCreated(null)}
          >
            I&apos;ve saved it
          </Button>
        </section>
      ) : null}

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Create a key</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each key allows 60 requests a minute and 20,000 a day. You can have up
          to {MAX_ACTIVE_KEYS} active keys.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            if (!busy && !atLimit) void createKey()
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="api-key-label">Name (optional)</Label>
            <Input
              id="api-key-label"
              value={label}
              maxLength={LABEL_MAX_LENGTH}
              placeholder="e.g. my-search-app production"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || atLimit}>
            Create key
          </Button>
        </form>
        {atLimit ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Revoke a key you no longer use to create another.
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Your keys</h2>
        {keys.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            You haven&apos;t created any keys yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => {
                  const status = keyStatus(key)
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">
                        {key.label || 'Untitled key'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        cak_{key.id}_…
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(key.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(key.last_used_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            status === 'Active' ? 'secondary' : 'outline'
                          }
                        >
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {status === 'Active' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => setRevoking(key)}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Last used is approximate, to within a few minutes. Revoked keys stop
          working within two minutes and are listed here for 30 days.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Using the API</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Base URL: <code className="font-mono">{baseUrl}</code>
          </li>
          <li>
            Send <code className="font-mono">Authorization: Bearer cak_…</code>{' '}
            with every request.
          </li>
          <li>
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href={`${baseUrl}/openapi.json`}
            >
              API reference (OpenAPI)
            </a>
          </li>
          <li>
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href={MIGRATION_GUIDE_URL}
            >
              Moving from the old Supabase API
            </a>
          </li>
        </ul>
      </section>

      <Dialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this key?</DialogTitle>
            <DialogDescription>
              {revoking?.label || 'This key'} (cak_{revoking?.id}_…) will stop
              working within two minutes. Anything still using it will get 401
              errors. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (revoking) void revokeKey(revoking)
              }}
            >
              Revoke key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
