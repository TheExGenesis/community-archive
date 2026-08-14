import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { DigestDaySelector } from '@/components/digest/DigestDaySelector'
import { requireAdmin } from '@/app/admin/data'
import { loadDigestLabState } from '@/lib/digest/data'
import { listPastDigestDates } from '@/lib/digest/dateWindow'
import type { DigestEdition, DigestRun } from '@/lib/digest/types'
import {
  createDigestPromptVersionAction,
  createAndGenerateDigestDateAction,
  createDigestRunAction,
  duplicateDigestRunAction,
  generateDigestRunAction,
  publishDigestEditionAction,
  reviseDigestRunAction,
  stageDigestEditionAction,
  stageEditedDigestEditionAction,
  updateDigestSelectionAction,
} from './actions'
import { DigestJobProgress } from './DigestJobProgress'
import { DigestContentFields, DigestEditionEditor } from './DigestEditionEditor'
import { SubmitButton } from './SubmitButton'

export const dynamic = 'force-dynamic'
export const maxDuration = 120
export const metadata = { title: 'Daily Digest lab · Community Archive' }

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date(value)) + ' UTC'
    : '—'

const formatDuration = (value: number | null) =>
  value === null
    ? '—'
    : value < 1_000
      ? `${value} ms`
      : `${(value / 1_000).toFixed(1)} s`

function RunList({
  runs,
  activeRun,
  editions,
}: {
  runs: DigestRun[]
  activeRun: DigestRun | null
  editions: DigestEdition[]
}) {
  const publishedRunIds = new Set(
    editions
      .filter(({ status }) => status === 'published')
      .map(({ sourceRunId }) => sourceRunId),
  )
  return (
    <div className="space-y-2">
      {runs.map((run) => {
        const isPublished = publishedRunIds.has(run.id)
        return (
          <Link
            key={run.id}
            href={`/admin/digest?run=${run.id}`}
            className={`block rounded-md border p-3 transition hover:border-zinc-400 ${
              run.id === activeRun?.id
                ? 'border-zinc-950 bg-zinc-50 dark:border-white dark:bg-zinc-900'
                : 'border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{run.digestDate}</span>
              <Badge
                variant={
                  isPublished
                    ? 'default'
                    : run.status === 'failed'
                      ? 'destructive'
                      : 'secondary'
                }
              >
                {isPublished ? 'published' : run.status.replace('_', ' ')}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {run.candidates.filter(({ selected }) => selected).length}{' '}
              selected · {formatDateTime(run.createdAt)}
            </div>
          </Link>
        )
      })}
      {runs.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No runs yet. Pull the latest 24-hour candidate snapshot to begin.
        </p>
      ) : null}
    </div>
  )
}

function EditionList({
  editions,
  activeRun,
}: {
  editions: DigestEdition[]
  activeRun: DigestRun | null
}) {
  return (
    <div className="space-y-2">
      {editions.map((edition) => (
        <div
          key={edition.id}
          className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold">{edition.digestDate}</span>{' '}
              <span className="text-xs text-muted-foreground">
                v{edition.version} · № {edition.issueNumber}
              </span>
            </div>
            <Badge
              variant={edition.status === 'published' ? 'default' : 'secondary'}
            >
              {edition.status}
            </Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {edition.status === 'published' ? (
              <Link
                className="text-sm font-semibold text-brand hover:underline"
                href={`/digest/${edition.digestDate}`}
              >
                Open public page →
              </Link>
            ) : edition.status === 'draft' ? (
              <form action={publishDigestEditionAction}>
                <input type="hidden" name="edition_id" value={edition.id} />
                <input
                  type="hidden"
                  name="run_id"
                  value={activeRun?.id ?? edition.sourceRunId}
                />
                <SubmitButton pendingLabel="Publishing…">
                  Publish this version
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function DigestLabPage({
  searchParams,
}: {
  searchParams?: {
    run?: string
    month?: string
    notice?: string
    error?: string
  }
}) {
  await requireAdmin()
  const state = await loadDigestLabState(searchParams?.run)
  const prompt = state.prompts[0]
  const pastDates = listPastDigestDates(365)
  const runningRuns = state.runs.filter(({ status }) => status === 'running')
  const activePrompt =
    state.prompts.find(
      (item) => item.id === state.activeRun?.promptVersionId,
    ) ?? prompt
  const activeDraft = state.activeRun
    ? (state.editions.find(
        (edition) =>
          edition.sourceRunId === state.activeRun?.id &&
          edition.status === 'draft',
      ) ?? null)
    : null
  const activePublished = state.activeRun
    ? (state.editions.find(
        (edition) =>
          edition.sourceRunId === state.activeRun?.id &&
          edition.status === 'published',
      ) ?? null)
    : null

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-background">
      <div className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <Link href="/admin" className="hover:text-foreground">
                ← Admin
              </Link>
              <span>Private editorial workspace</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Daily Digest lab
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Pull a frozen 24-hour banger set, choose what belongs, compare
              immutable prompt versions, inspect the exact request and run
              trace, then stage a public edition. Nothing publishes
              automatically.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {runningRuns[0] ? (
              <Link
                href={`/admin/digest?run=${runningRuns[0].id}`}
                className="dark:bg-amber-950/35 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:text-amber-100"
              >
                <span
                  className="h-2 w-2 animate-pulse rounded-full bg-amber-500"
                  aria-hidden="true"
                />
                {runningRuns.length} {runningRuns.length === 1 ? 'job' : 'jobs'}{' '}
                running
              </Link>
            ) : null}
            <Badge
              variant={state.generationConfigured ? 'default' : 'destructive'}
            >
              {state.generationConfigured
                ? 'Model configured'
                : 'Model key missing'}
            </Badge>
            <Link
              href="/digest"
              className="rounded-md border bg-white px-3 py-2 text-sm font-semibold dark:bg-zinc-900"
            >
              Public digest →
            </Link>
          </div>
        </div>

        {searchParams?.notice ? (
          <div
            role="status"
            className="mb-5 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
          >
            {searchParams.notice}
          </div>
        ) : null}
        {searchParams?.error ? (
          <div
            role="alert"
            className="mb-5 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"
          >
            {searchParams.error}
          </div>
        ) : null}

        {activeDraft && state.activeRun ? (
          <section className="mb-6 flex flex-col gap-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 p-5 shadow-sm dark:bg-emerald-950/25 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800 dark:text-emerald-200">
                Draft v{activeDraft.version} ready
              </div>
              <h2 className="mt-1 text-xl font-semibold text-emerald-950 dark:text-emerald-50">
                Publish the {activeDraft.digestDate} Daily Digest
              </h2>
              <p className="mt-1 text-sm text-emerald-900/75 dark:text-emerald-100/75">
                Publishing makes this exact draft the public edition. It never
                happens automatically.
              </p>
            </div>
            <form action={publishDigestEditionAction}>
              <input type="hidden" name="edition_id" value={activeDraft.id} />
              <input type="hidden" name="run_id" value={state.activeRun.id} />
              <SubmitButton pendingLabel="Publishing Daily Digest…">
                Publish Daily Digest
              </SubmitButton>
            </form>
          </section>
        ) : null}

        <div className="grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <aside className="space-y-6 xl:sticky xl:top-20">
            <section className="rounded-lg border bg-card p-4">
              <h2 className="font-semibold">Start a run</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Candidate pulls are exact snapshots; later refreshes never
                mutate an existing run.
              </p>
              {prompt ? (
                <form action={createDigestRunAction} className="mt-4 space-y-3">
                  <label
                    className="block text-xs font-semibold"
                    htmlFor="prompt_version_id"
                  >
                    Prompt version
                  </label>
                  <select
                    id="prompt_version_id"
                    name="prompt_version_id"
                    defaultValue={prompt.id}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {state.prompts.map((item) => (
                      <option key={item.id} value={item.id}>
                        v{item.version} · {item.label}
                      </option>
                    ))}
                  </select>
                  <SubmitButton pendingLabel="Pulling candidates…">
                    Pull last 24 hours
                  </SubmitButton>
                </form>
              ) : (
                <p className="mt-3 text-sm text-red-700">
                  Apply the digest database migration first.
                </p>
              )}
            </section>

            <section className="rounded-lg border bg-card p-4">
              <h2 className="font-semibold">Generate a past day</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Each day runs from 06:00 UTC through 05:59 UTC the next day, so
                European morning and the same-date US West Coast evening stay
                together. Jobs keep running after refresh or navigation.
              </p>
              {prompt ? (
                <div className="mt-4">
                  <DigestDaySelector
                    currentDate={pastDates[0]}
                    editions={[]}
                    variant="editorial"
                    generation={{
                      action: createAndGenerateDigestDateAction,
                      dates: pastDates,
                      promptVersionId: prompt.id,
                      runningRuns: runningRuns.map((run) => ({
                        date: run.digestDate,
                        id: run.id,
                      })),
                    }}
                  />
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-3 font-semibold">Recent runs</h2>
              <RunList
                runs={state.runs}
                activeRun={state.activeRun}
                editions={state.editions}
              />
            </section>
          </aside>

          <div className="min-w-0 space-y-6">
            {state.activeRun ? (
              <>
                <section className="rounded-lg border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Run {state.activeRun.id.slice(0, 8)}
                      </div>
                      <h2 className="mt-1 text-2xl font-semibold">
                        {state.activeRun.digestDate}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDateTime(state.activeRun.windowStart)} →{' '}
                        {formatDateTime(state.activeRun.windowEnd)}
                      </p>
                      {state.activeRun.parentRunId ? (
                        <p className="mt-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                          Revision of run{' '}
                          {state.activeRun.parentRunId.slice(0, 8)}
                          {state.activeRun.revisionInstruction
                            ? ` · ${state.activeRun.revisionInstruction}`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant={
                        activePublished
                          ? 'default'
                          : state.activeRun.status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {activePublished
                        ? 'published'
                        : state.activeRun.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    {[
                      [
                        'Candidates',
                        state.activeRun.candidates.length.toString(),
                      ],
                      [
                        'Selected',
                        state.activeRun.candidates
                          .filter(({ selected }) => selected)
                          .length.toString(),
                      ],
                      ['Duration', formatDuration(state.activeRun.durationMs)],
                      [
                        'Tokens',
                        state.activeRun.totalTokens?.toLocaleString() ?? '—',
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md bg-zinc-100 px-3 py-3 dark:bg-zinc-900"
                      >
                        <div className="text-xs text-muted-foreground">
                          {label}
                        </div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  {state.activeRun.error ? (
                    <pre className="mt-4 overflow-auto whitespace-pre-wrap rounded-md bg-red-50 p-3 text-xs text-red-900 dark:bg-red-950/30 dark:text-red-100">
                      {state.activeRun.error}
                    </pre>
                  ) : null}
                </section>

                {state.activeRun.status === 'running' ? (
                  <DigestJobProgress
                    runId={state.activeRun.id}
                    startedAt={state.activeRun.startedAt}
                    workflowRunId={state.activeRun.workflowRunId}
                    events={state.activeRun.events}
                  />
                ) : null}

                <section className="rounded-lg border bg-card p-5">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">
                        Candidate selection
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Up to 50 posts with a Community Archive banger score of
                        at least two, ranked strongest first.
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {state.activeRun.status === 'candidates_ready'
                        ? 'Save selection before generating'
                        : state.activeRun.status === 'running'
                          ? 'Locked while generation is running'
                          : 'Changing this creates a new editable run'}
                    </span>
                  </div>
                  <form action={updateDigestSelectionAction}>
                    <input
                      type="hidden"
                      name="run_id"
                      value={state.activeRun.id}
                    />
                    <input
                      type="hidden"
                      name="prompt_version_id"
                      value={prompt?.id ?? state.activeRun.promptVersionId}
                    />
                    <div className="max-h-[760px] divide-y overflow-y-auto rounded-md border">
                      {state.activeRun.candidates.map((candidate) => (
                        <label
                          key={candidate.tweet.id}
                          className="flex cursor-pointer gap-3 p-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
                        >
                          <input
                            type="checkbox"
                            name="selected_tweet_id"
                            value={candidate.tweet.id}
                            defaultChecked={candidate.selected}
                            disabled={state.activeRun.status === 'running'}
                            className="mt-1 h-4 w-4 rounded border-zinc-300"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-2 text-sm">
                              <strong>
                                #{candidate.sourceRank} · {candidate.tweet.name}
                              </strong>
                              <span className="text-muted-foreground">
                                @{candidate.tweet.username}
                              </span>
                              <span className="ml-auto tabular-nums text-muted-foreground">
                                ✦ {candidate.tweet.quoteCount ?? 0} · ♥{' '}
                                {candidate.tweet.likes.toLocaleString()}
                              </span>
                            </span>
                            <span className="mt-2 block whitespace-pre-wrap text-sm leading-6">
                              {candidate.tweet.text}
                            </span>
                          </span>
                        </label>
                      ))}
                      {state.activeRun.candidates.length === 0 ? (
                        <p className="p-5 text-sm text-muted-foreground">
                          No recent bangers met the current quote-based
                          threshold.
                        </p>
                      ) : null}
                    </div>
                    {state.activeRun.status !== 'running' ? (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <SubmitButton
                          pendingLabel="Saving selection…"
                          variant="secondary"
                        >
                          {state.activeRun.status === 'candidates_ready'
                            ? 'Save selection'
                            : 'Save selection as new run'}
                        </SubmitButton>
                      </div>
                    ) : (
                      <p className="mt-4 text-xs leading-5 text-muted-foreground">
                        This selection will unlock when the durable generation
                        finishes.
                      </p>
                    )}
                  </form>
                </section>

                <section className="rounded-lg border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">Generate</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Prompt v{activePrompt?.version ?? '—'} ·{' '}
                        {activePrompt?.model ?? 'unknown model'}
                      </p>
                    </div>
                    {state.activeRun.status === 'candidates_ready' ? (
                      <form action={generateDigestRunAction}>
                        <input
                          type="hidden"
                          name="run_id"
                          value={state.activeRun.id}
                        />
                        <SubmitButton pendingLabel="Clustering and writing…">
                          Generate from saved selection
                        </SubmitButton>
                      </form>
                    ) : state.activeRun.status === 'running' ? (
                      <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                        Durable job in progress…
                      </span>
                    ) : (
                      <form
                        action={duplicateDigestRunAction}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input
                          type="hidden"
                          name="run_id"
                          value={state.activeRun.id}
                        />
                        <label className="text-xs font-semibold">
                          Prompt for clone
                          <select
                            name="prompt_version_id"
                            defaultValue={prompt?.id ?? activePrompt?.id}
                            className="mt-1 block rounded-md border bg-background px-2 py-2 text-sm"
                          >
                            {state.prompts.map((item) => (
                              <option key={item.id} value={item.id}>
                                v{item.version} · {item.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <SubmitButton
                          pendingLabel="Cloning snapshot…"
                          variant="secondary"
                        >
                          Clone as new run
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </section>

                {state.activeRun.parsedOutput ? (
                  <section className="rounded-lg border bg-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Validated output
                        </div>
                        <h2 className="mt-1 text-xl font-semibold">
                          {state.activeRun.parsedOutput.stories.length} stories
                          ready to edit
                        </h2>
                      </div>
                      <form action={stageDigestEditionAction}>
                        <input
                          type="hidden"
                          name="run_id"
                          value={state.activeRun.id}
                        />
                        <SubmitButton
                          pendingLabel="Staging edition…"
                          variant="secondary"
                        >
                          Stage as new draft version
                        </SubmitButton>
                      </form>
                    </div>
                    {state.activeRun.parsedOutput.editorialWarnings?.length ? (
                      <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                        <div className="font-semibold">
                          Ready with editorial notes
                        </div>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {state.activeRun.parsedOutput.editorialWarnings.map(
                            (warning) => (
                              <li key={warning}>{warning}</li>
                            ),
                          )}
                        </ul>
                      </div>
                    ) : null}
                    <form
                      action={stageEditedDigestEditionAction}
                      className="mt-5 space-y-7 rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20"
                    >
                      <input
                        type="hidden"
                        name="run_id"
                        value={state.activeRun.id}
                      />
                      <div>
                        <div className="font-semibold">
                          Edit the validated copy inline
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Correct typos or wording below. Saving creates a new
                          private draft; the validated model run stays
                          unchanged.
                        </p>
                      </div>
                      <DigestContentFields
                        content={state.activeRun.parsedOutput}
                      />
                      <div className="flex flex-wrap items-center gap-3 border-t border-blue-200 pt-4 dark:border-blue-900">
                        <SubmitButton pendingLabel="Saving corrections…">
                          Save corrections as new draft
                        </SubmitButton>
                        <span className="text-xs text-muted-foreground">
                          This does not publish the edition.
                        </span>
                      </div>
                    </form>
                    <form
                      action={reviseDigestRunAction}
                      className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/25"
                    >
                      <input
                        type="hidden"
                        name="run_id"
                        value={state.activeRun.id}
                      />
                      <input
                        type="hidden"
                        name="prompt_version_id"
                        value={prompt?.id ?? state.activeRun.promptVersionId}
                      />
                      <label className="block font-semibold">
                        Ask for a simple revision
                        <textarea
                          name="revision_instruction"
                          rows={3}
                          maxLength={2000}
                          required
                          placeholder="For example: Treat the P vs. NP post as a viral joke, tighten the third summary bullet, and leave the other stories unchanged."
                          className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6"
                        />
                      </label>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        This makes a new versioned generation run and opens its
                        result when it finishes. The current run stays intact.
                      </p>
                      <div className="mt-3">
                        <SubmitButton pendingLabel="Starting revision…">
                          Create revised version
                        </SubmitButton>
                      </div>
                    </form>
                  </section>
                ) : null}

                {activeDraft ? (
                  <DigestEditionEditor
                    edition={activeDraft}
                    runId={state.activeRun.id}
                  />
                ) : null}
              </>
            ) : (
              <section className="rounded-lg border border-dashed bg-card p-10 text-center">
                <h2 className="text-xl font-semibold">
                  Create a run to start experimenting
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  The lab will save the source window, every candidate, and
                  every later generation event.
                </p>
              </section>
            )}
          </div>

          <aside className="space-y-6 xl:sticky xl:top-20">
            {activePrompt ? (
              <section className="rounded-lg border bg-card p-4">
                <div className="mb-3">
                  <h2 className="font-semibold">
                    Fork prompt v{activePrompt.version}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Saving creates a new immutable version. Existing runs keep
                    their original configuration.
                  </p>
                </div>
                <form
                  action={createDigestPromptVersionAction}
                  className="space-y-3"
                >
                  <label className="block text-xs font-semibold">
                    Label
                    <input
                      name="label"
                      defaultValue={`${activePrompt.label} fork`}
                      maxLength={120}
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-xs font-semibold">
                    Model
                    <input
                      name="model"
                      defaultValue={activePrompt.model}
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-semibold">
                      Reasoning
                      <select
                        name="reasoning_effort"
                        defaultValue={
                          activePrompt.parameters.reasoning_effort ?? 'high'
                        }
                        className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-sm"
                      >
                        <option>none</option>
                        <option>low</option>
                        <option>medium</option>
                        <option>high</option>
                      </select>
                    </label>
                    <label className="block text-xs font-semibold">
                      Max tokens
                      <input
                        name="max_output_tokens"
                        type="number"
                        min={1000}
                        max={20000}
                        step={250}
                        defaultValue={
                          activePrompt.parameters.max_output_tokens ?? 5000
                        }
                        className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <label className="block text-xs font-semibold">
                    System prompt
                    <textarea
                      name="system_prompt"
                      defaultValue={activePrompt.systemPrompt}
                      rows={8}
                      maxLength={20000}
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-5"
                    />
                  </label>
                  <label className="block text-xs font-semibold">
                    User template
                    <textarea
                      name="user_prompt_template"
                      defaultValue={activePrompt.userPromptTemplate}
                      rows={10}
                      maxLength={20000}
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-5"
                    />
                  </label>
                  <SubmitButton
                    pendingLabel="Saving prompt…"
                    variant="secondary"
                  >
                    Save new prompt version
                  </SubmitButton>
                </form>
              </section>
            ) : null}

            {state.activeRun ? (
              <section className="rounded-lg border bg-card p-4">
                <h2 className="font-semibold">Run trace</h2>
                <ol className="mt-4 space-y-4 border-l pl-4">
                  {state.activeRun.events.map((item, index) => (
                    <li key={`${item.at}-${index}`} className="relative">
                      <span
                        className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${item.status === 'failed' ? 'bg-red-500' : item.status === 'started' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                      />
                      <div className="text-xs font-semibold uppercase tracking-wide">
                        {item.stage} · {item.status}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {item.message}
                      </p>
                      <time className="mt-1 block text-[11px] text-muted-foreground">
                        {formatDateTime(item.at)}
                      </time>
                      {item.metadata ? (
                        <pre className="mt-2 overflow-x-auto rounded bg-zinc-100 p-2 text-[10px] dark:bg-zinc-900">
                          {JSON.stringify(item.metadata, null, 2)}
                        </pre>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-3 font-semibold">Edition ledger</h2>
              <EditionList
                editions={state.editions}
                activeRun={state.activeRun}
              />
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}
