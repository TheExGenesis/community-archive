'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  defaults,
  metrics,
  rank,
  weightedCounts,
  type Settings,
  type Metric,
  type Lane,
} from '@/lib/keyword-ranking'
import { parseKeywordLab, type KeywordLab } from '@/lib/keywordLab'

const lanes: { id: Lane; title: string; description: string; color: string }[] =
  [
    {
      id: 'emerging',
      title: 'Breaking out',
      description: 'Small baseline, disproportionate growth',
      color: 'border-t-purple-500',
    },
    {
      id: 'rising',
      title: 'Big & rising',
      description: 'Established terms gaining share',
      color: 'border-t-emerald-600',
    },
    {
      id: 'falling',
      title: 'Cooling off',
      description: 'Previously surfaced, now losing share',
      color: 'border-t-rose-500',
    },
  ]
const field = 'w-full rounded-lg border bg-background px-3 py-2 text-foreground'
const panel = 'rounded-xl border bg-card p-5'
const dateAt = (through: string, offset: number) =>
  new Date(Date.parse(through) + offset * 86_400_000).toISOString().slice(0, 10)
const num = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 1 })
const pct = (n: number | null) =>
  n === null
    ? 'New'
    : `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString('en-US')}%`
const numeric: {
  key: keyof Settings
  label: string
  min: number
  max: number
  step?: number
}[] = [
  { key: 'authors', label: 'Min authors', min: 2, max: 1000 },
  { key: 'tweets', label: 'Min tweets', min: 3, max: 10000 },
  { key: 'large', label: '“Big” per 100k', min: 1, max: 100000 },
  { key: 'move', label: 'Big movers ≥ %', min: 1, max: 10000 },
  { key: 'breakout', label: 'Breakouts ≥ %', min: 1, max: 10000 },
  { key: 'smoothing', label: 'Smoothing units', min: 1, max: 10000 },
]

export function KeywordDashboard() {
  const [days, setDays] = useState<1 | 7>(7)
  const [through, setThrough] = useState('')
  const [settings, setSettings] = useState<Settings>(() => defaults(7))
  const [payload, setPayload] = useState<KeywordLab | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setPayload(null)
    setError('')
    fetch(`/api/admin/keywords?days=${days}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? 'Admin access is required.'
              : 'Live keyword data is unavailable. Please retry.',
          )
        return parseKeywordLab(await response.json())
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setPayload(data)
        setThrough((current) =>
          data.datasets.some((d) => d.through === current)
            ? current
            : data.datasets[data.datasets.length - 1].through,
        )
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error ? err.message : 'Unable to load keywords.',
          )
      })
    return () => controller.abort()
  }, [days, reload])
  const dataset = payload?.datasets.find((d) => d.through === through)
  const ranked = useMemo(
    () => (dataset ? rank(dataset, settings, [], payload?.datasets) : null),
    [dataset, settings, payload],
  )
  const chosen = dataset?.rows.find((row) => row[0] === selected)
  const chosenRank =
    ranked &&
    Object.values(ranked.lanes)
      .flat()
      .find((row) => row.term === selected)
  const spec = metrics[settings.metric]
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }))
  function exportPreview() {
    const file = new Blob(
      [
        JSON.stringify(
          {
            through,
            days,
            settings,
            generatedAt: payload?.generatedAt,
            lanes:
              ranked &&
              Object.fromEntries(
                Object.entries(ranked.lanes).map(([key, rows]) => [
                  key,
                  rows.slice(0, 20),
                ]),
              ),
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(file),
      link = document.createElement('a')
    link.href = url
    link.download = `keyword-preview-${through}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <>
      <section aria-label="Time and activity" className={panel}>
        <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-2 text-sm font-medium">
            Through
            <select
              className={field}
              value={through}
              disabled={!payload}
              onChange={(e) => setThrough(e.target.value)}
            >
              {payload ? (
                [...payload.datasets]
                  .reverse()
                  .map((d) => <option key={d.through}>{d.through}</option>)
              ) : (
                <option value="">Loading…</option>
              )}
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium">
            Compare
            <select
              className={field}
              value={days}
              onChange={(e) => {
                const d = Number(e.target.value) as 1 | 7
                setDays(d)
                setSettings(defaults(d))
                setPayload(null)
              }}
            >
              <option value={7}>7 days vs previous 7</option>
              <option value={1}>1 day vs previous day</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium">
            Activity measure
            <select
              className={field}
              value={settings.metric}
              onChange={(e) => update('metric', e.target.value as Metric)}
            >
              {(Object.keys(metrics) as Metric[]).map((m) => (
                <option value={m} key={m}>
                  {metrics[m].label}
                </option>
              ))}
            </select>
          </label>
          <button className={field} onClick={() => setSettings(defaults(days))}>
            Reset controls
          </button>
          <button className={field} onClick={() => setReload((n) => n + 1)}>
            Refresh data
          </button>
        </div>
        {dataset && (
          <p className="mt-4 text-sm text-muted-foreground">
            {dateAt(through, 1 - days)}–{through} vs{' '}
            {dateAt(through, 1 - 2 * days)}–{dateAt(through, -days)} ·{' '}
            {num(ranked?.all?.[1] ?? 0)} vs {num(ranked?.all?.[2] ?? 0)} member
            tweets · complete UTC days
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Ranking, growth, the big cutoff and phrase coverage use {spec.label}.
          Shares divide by each period’s total {spec.unit}. Raw tweet and author
          minimums still apply. Changing measure keeps your cutoff.
        </p>
      </section>
      <section aria-label="Ranking controls" className={panel}>
        <div className="grid gap-6 md:grid-cols-3">
          {(
            [
              { key: 'balance', label: 'Size ↔ surprise', max: 1, step: 0.05 },
              { key: 'phrase', label: 'Phrase boost', max: 200, step: 5 },
              {
                key: 'penalty',
                label: 'Personal downweight',
                max: 100,
                step: 5,
              },
            ] as const
          ).map((c) => (
            <label className="space-y-3 text-sm font-medium" key={c.key}>
              <span className="flex justify-between">
                {c.label}
                <span className="tabular-nums">
                  {c.key === 'balance'
                    ? settings[c.key].toFixed(2)
                    : `${settings[c.key]}%`}
                </span>
              </span>
              <input
                aria-label={c.label}
                className="w-full accent-cyan-600"
                type="range"
                min={0}
                max={c.max}
                step={c.step}
                value={settings[c.key]}
                onChange={(e) => update(c.key, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {numeric.map((c) => (
            <label key={c.key} className="space-y-2 text-sm font-medium">
              {c.label}
              <input
                className={field}
                type="number"
                min={c.min}
                max={c.max}
                step={c.step ?? 1}
                value={settings[c.key] as number}
                onChange={(e) => {
                  const n = e.target.valueAsNumber
                  if (Number.isFinite(n))
                    update(c.key, Math.max(c.min, Math.min(c.max, n)))
                }}
              />
            </label>
          ))}
        </div>
        <label className="mt-5 block space-y-2 text-sm">
          Downweight these exact terms
          <input
            className={field}
            placeholder="Optional, comma separated"
            value={settings.generic}
            onChange={(e) => update('generic', e.target.value)}
          />
        </label>
        <div className="mt-5 flex flex-wrap gap-6">
          {(
            [
              { key: 'phrasesOnly', label: 'Phrases only' },
              { key: 'collapse', label: 'Collapse plurals' },
              { key: 'dedupePhrases', label: 'Group words under phrases' },
            ] as const
          ).map((c) => (
            <label className="flex items-center gap-2 text-sm" key={c.key}>
              <input
                type="checkbox"
                checked={settings[c.key]}
                onChange={(e) => update(c.key, e.target.checked)}
              />
              {c.label}
            </label>
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-2 text-sm">
            Phrase covers ≥ % of word activity
            <input
              className={field}
              type="number"
              min={50}
              max={100}
              value={settings.phraseCoverage}
              onChange={(e) =>
                update(
                  'phraseCoverage',
                  Math.max(50, Math.min(100, Number(e.target.value))),
                )
              }
            />
          </label>
          <label className="space-y-2 text-sm">
            Falling list
            <select
              className={field}
              value={settings.fallingMode}
              onChange={(e) =>
                update('fallingMode', e.target.value as Settings['fallingMode'])
              }
            >
              <option value="history">Previously surfaced → cooling off</option>
              <option value="all">All big declines</option>
            </select>
          </label>
          {(
            [
              { key: 'fallingTweets', label: 'Min prior tweets' },
              { key: 'fallingAuthors', label: 'Min prior authors' },
            ] as const
          ).map((c) => (
            <label className="space-y-2 text-sm" key={c.key}>
              {c.label}
              <input
                className={field}
                type="number"
                min={0}
                max={10000}
                value={settings[c.key]}
                onChange={(e) =>
                  update(
                    c.key,
                    Math.max(0, Math.min(10000, Number(e.target.value))),
                  )
                }
              />
            </label>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Cooling off uses earlier top-20 breakout/rising appearances,
          reconstructed with these controls. {ranked?.historyDates?.length ?? 0}{' '}
          earlier snapshots available for this date. Weekly windows overlap.
        </p>
      </section>
      {error ? (
        <div role="alert" className={`${panel} border-red-400`}>
          {error}{' '}
          <button className="underline" onClick={() => setReload((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : !payload ? (
        <p role="status">
          Loading live keywords and recent history… The first request can take
          up to a minute.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                Three ways a conversation changes
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Top 20 per category · {num(ranked?.eligible ?? 0)} eligible
                candidates. Click a term to inspect it.
              </p>
            </div>
            <button
              className="rounded-lg border px-4 py-2 text-sm"
              onClick={exportPreview}
            >
              Export preview + settings
            </button>
          </div>
          <div className="grid items-start gap-5 lg:grid-cols-3">
            {lanes.map((lane) => {
              const rows = ranked?.lanes[lane.id] ?? []
              return (
                <section
                  key={lane.id}
                  aria-label={
                    lane.id === 'falling' && settings.fallingMode === 'all'
                      ? 'Big & falling'
                      : lane.title
                  }
                  className={`min-w-0 overflow-hidden rounded-xl border border-t-4 bg-card ${lane.color}`}
                >
                  <div className="p-5">
                    <h2 className="flex items-center justify-between gap-2 text-xl font-semibold">
                      {lane.id === 'falling' && settings.fallingMode === 'all'
                        ? 'Big & falling'
                        : lane.title}
                      <span className="text-sm font-normal">
                        {Math.min(20, rows.length)} of {rows.length}
                      </span>
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {lane.id === 'falling' && settings.fallingMode === 'all'
                        ? 'Established terms losing share'
                        : lane.description}
                    </p>
                  </div>
                  <table className="w-full table-fixed text-sm">
                    <thead className="border-y text-xs text-muted-foreground">
                      <tr>
                        <th className="w-1/2 p-3 text-left">Term / authors</th>
                        <th className="p-3 text-right">Tweets</th>
                        <th className="p-3 text-right">Share Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 20).map((row) => (
                        <tr className="border-b last:border-b-0" key={row.term}>
                          <td className="break-words p-3">
                            <button
                              className="text-left font-semibold text-brand hover:underline"
                              onClick={() => setSelected(row.term)}
                            >
                              {row.term}
                            </button>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {row.authors} authors
                              {row.collapsedTerms?.length
                                ? ` · ${row.collapsedTerms.length} grouped`
                                : ''}
                            </p>
                            {row.previousHot && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {row.previousHot.lane === 'emerging'
                                  ? 'Breakout'
                                  : 'Rising'}{' '}
                                {row.previousHot.through}
                              </p>
                            )}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {num(row.current)}
                            <p className="text-xs text-muted-foreground">
                              was {num(row.previous)}
                            </p>
                          </td>
                          <td
                            className={`p-3 text-right tabular-nums ${row.change !== null && row.change < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}
                          >
                            {pct(row.change)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!rows.length && (
                    <p className="p-5 text-sm text-muted-foreground">
                      {lane.id === 'falling' &&
                      settings.fallingMode === 'history' &&
                      !ranked?.historyDates?.length
                        ? 'No earlier snapshots for this date.'
                        : 'No terms meet these settings.'}
                    </p>
                  )}
                </section>
              )
            })}
          </div>
          <section aria-label="Inspect a term" className={panel}>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                setSelected(search.trim().toLowerCase())
              }}
            >
              <label className="min-w-0 flex-1 space-y-2 text-sm">
                Inspect any extracted term
                <input
                  className={field}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  list="keyword-terms"
                />
                <datalist id="keyword-terms">
                  {dataset?.rows
                    .filter((r) => r[0] !== '__all_tweets__')
                    .map((r) => <option key={r[0]} value={r[0]} />)}
                </datalist>
              </label>
              <button className="rounded-lg border px-4 py-2">Inspect</button>
            </form>
            {chosen && ranked?.all ? (
              (() => {
                const [current, previous] = weightedCounts(
                    chosen,
                    settings.metric,
                  ),
                  [total, priorTotal] = weightedCounts(
                    ranked.all,
                    settings.metric,
                  )
                const rate = total ? (current / total) * 100000 : 0,
                  prior = priorTotal ? (previous / priorTotal) * 100000 : 0
                const series = payload.datasets
                  .filter((d) => d.through <= through)
                  .map((d) => {
                    const r = d.rows.find((r) => r[0] === selected),
                      all = d.rows.find((r) => r[0] === '__all_tweets__')
                    return {
                      through: d.through,
                      value:
                        r && all && weightedCounts(all, settings.metric)[0] > 0
                          ? (weightedCounts(r, settings.metric)[0] /
                              weightedCounts(all, settings.metric)[0]) *
                            100000
                          : null,
                    }
                  })
                const max = Math.max(1, ...series.map((p) => p.value ?? 0))
                return (
                  <div className="mt-5 space-y-4">
                    <div className="flex flex-wrap justify-between gap-3">
                      <h2 className="text-2xl font-semibold">{selected}</h2>
                      <a
                        className="text-brand hover:underline"
                        href={`/search?${new URLSearchParams({ q: selected, sinceDate: dateAt(through, 1 - days), untilDate: through })}`}
                      >
                        Read tweets in this window →
                      </a>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        [
                          `${num(chosen[2])} → ${num(chosen[1])}`,
                          'tweets, previous → current',
                        ],
                        [
                          `${num(chosen[4])} → ${num(chosen[3])}`,
                          'distinct authors',
                        ],
                        [`${num(previous)} → ${num(current)}`, spec.label],
                        [`${num(prior)} → ${num(rate)}`, 'share per 100,000'],
                      ].map(([v, l]) => (
                        <div key={l}>
                          <p className="text-xl font-semibold">{v}</p>
                          <p className="text-sm text-muted-foreground">{l}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {chosenRank
                        ? `Score ${num(chosenRank.score)} = base ${num(chosenRank.base)} × phrase ${num(chosenRank.phraseMultiplier)} × personal ${num(chosenRank.personalMultiplier)}.`
                        : 'This term is not shown under the current controls.'}{' '}
                      {chosenRank?.collapsedTerms?.length
                        ? `Grouped: ${chosenRank.collapsedTerms.map((t) => t.term).join(', ')}. Counts belong to the phrase itself; position uses the strongest member score.`
                        : ''}
                    </p>
                    <div
                      className="flex h-40 gap-2"
                      aria-label="Historical share"
                    >
                      {series.map((p) => (
                        <div
                          key={p.through}
                          className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1 text-xs"
                        >
                          <span>{p.value === null ? '—' : num(p.value)}</span>
                          <div
                            className="max-w-16 w-full rounded-t bg-cyan-600"
                            style={{
                              height: `${((p.value ?? 0) / max) * 95}px`,
                            }}
                          />
                          <span>{p.through.slice(5)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {spec.label} per 100,000 · rolling {days} days. — means
                      below the extraction floor, not zero. Adjacent weekly
                      windows overlap.
                    </p>
                  </div>
                )
              })()
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                {selected
                  ? 'This term is below the extraction floor for this date.'
                  : 'Select a term above to inspect its counts and history.'}
              </p>
            )}
          </section>
          <details className={panel}>
            <summary className="cursor-pointer font-medium">
              Method and data limits
            </summary>
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              <p>
                Counts cover current consenting members, excluding retweets and
                deleted tweets. Each tweet counts once per term. Square roots
                are taken per author across the whole comparison window, then
                summed; 100 posts from one author contribute 10, while 100
                authors posting once contribute 100.
              </p>
              <p>
                Score = absolute share change ÷ (prior share + normalized
                smoothing)<sup>size ↔ surprise</sup>, multiplied by phrase
                boost and optional exact-term downweight. Phrase grouping checks
                whole words and keeps the phrase’s own counts.
              </p>
              <p>
                The server extracts unigrams and adjacent bigrams with at least{' '}
                {days === 7 ? '10 tweets / 3 authors' : '3 tweets / 2 authors'}{' '}
                in either period. Lower control values cannot recover omitted
                candidates. Generic-word filtering uses the existing stopwords;
                automatic proper-name detection and semantic clustering are not
                included.
              </p>
              <p>
                Recent snapshots are reconstructed from live data and cached for
                up to 24 hours, with membership changes invalidating them. They
                are not records of what was published. Counts snapshot:{' '}
                {payload.generatedAt}.
              </p>
            </div>
          </details>
        </>
      )}
    </>
  )
}
