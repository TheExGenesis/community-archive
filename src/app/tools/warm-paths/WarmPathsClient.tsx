'use client'

import { useState, useTransition } from 'react'
import { captureProductAction } from '@/lib/productAnalytics'
import { CARD, FAINT, MUTED } from '@/components/portal/styles'
import type {
  Connector,
  IntroSort,
  IntroTarget,
  WarmPath,
  WarmPerson,
} from '@/lib/warmPaths'
import { searchIntroductions, searchWarmPaths, type GraphMeta } from './actions'

type Tab = 'path' | 'intro'

const INPUT =
  'h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm dark:border-[#33333a] dark:bg-[#141416]'
const LABEL = `mb-1 block text-[11px] font-medium uppercase tracking-wide ${MUTED}`
const BUTTON =
  'h-9 rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-60'

const fmt = (n: number) => n.toLocaleString('en-US')

function Person({ person, end }: { person: WarmPerson; end: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <a
        href={`/user/${encodeURIComponent(person.accountId ?? person.username)}`}
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-brand hover:underline"
      >
        @{person.username}
      </a>
      {person.name && person.name !== person.username ? (
        <span className="text-sm">{person.name}</span>
      ) : null}
      <span className={`text-xs ${FAINT}`}>
        {fmt(person.followers)} followers
        {end ? '' : ` · ${fmt(person.twoWayTies)} two-way ties`}
      </span>
    </div>
  )
}

function PathCard({ path, rank }: { path: WarmPath; rank?: number }) {
  return (
    <div className={`${CARD} p-3.5`}>
      <div className={`mb-2 text-xs ${MUTED}`}>
        {rank ? `#${rank} · ` : ''}score {path.score.toFixed(3)} ·{' '}
        {path.ties.length} hop{path.ties.length === 1 ? '' : 's'}
      </div>
      {path.people.map((person, i) => (
        <div key={`${person.username}-${i}`}>
          <Person
            person={person}
            end={i === 0 || i === path.people.length - 1}
          />
          {i < path.ties.length ? (
            <div
              className={`my-1 ml-1.5 border-l-2 border-brand/40 py-0.5 pl-3 text-xs ${MUTED}`}
            >
              strength {path.ties[i].strength.toFixed(2)} ·{' '}
              {fmt(path.ties[i].out)} → / ← {fmt(path.ties[i].back)} replies and
              quotes · {path.ties[i].years} mutual year
              {path.ties[i].years === 1 ? '' : 's'}
              {path.ties[i].lastYear ? `, last ${path.ties[i].lastYear}` : ''}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function GraphNote({ graph }: { graph: GraphMeta }) {
  return (
    <p className={`mt-3 text-xs ${FAINT}`}>
      Social graph snapshot of {new Date(graph.generatedAt).toLocaleString()},{' '}
      {fmt(graph.people)} members with a two-way tie.
      {graph.truncated
        ? ' The snapshot keeps only the strongest ties, so weak ones are missing.'
        : ''}
    </p>
  )
}

export default function WarmPathsClient({
  defaultFrom,
}: {
  defaultFrom: string
}) {
  const [tab, setTab] = useState<Tab>('intro')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState('')
  const [maxHops, setMaxHops] = useState(4)
  const [minFollowers, setMinFollowers] = useState(5000)
  const [sort, setSort] = useState<IntroSort>('balanced')
  const [error, setError] = useState<string | null>(null)
  const [paths, setPaths] = useState<WarmPath[] | null>(null)
  const [intro, setIntro] = useState<{
    targets: IntroTarget[]
    connectors: Connector[]
  } | null>(null)
  const [graph, setGraph] = useState<GraphMeta | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const switchTab = (next: Tab) => {
    setTab(next)
    setError(null)
    captureProductAction('warm_paths', 'view_changed')
  }

  const runPath = () =>
    startTransition(async () => {
      captureProductAction('warm_paths', 'searched')
      const result = await searchWarmPaths({ from, to, maxHops })
      if (!result.ok) {
        setError(result.error)
        setPaths(null)
        return
      }
      setError(null)
      setPaths(result.paths)
      setGraph(result.graph)
    })

  const runIntro = () =>
    startTransition(async () => {
      captureProductAction('warm_paths', 'searched')
      const result = await searchIntroductions({ from, minFollowers, sort })
      if (!result.ok) {
        setError(result.error)
        setIntro(null)
        return
      }
      setError(null)
      setIntro({ targets: result.targets, connectors: result.connectors })
      setGraph(result.graph)
      setOpen(null)
    })

  const tabClass = (value: Tab) =>
    `rounded-full px-3.5 py-1.5 text-sm ${
      tab === value
        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
        : 'border border-zinc-300 dark:border-[#33333a]'
    }`

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap gap-2">
        <button
          className={tabClass('intro')}
          onClick={() => switchTab('intro')}
        >
          Who can introduce you
        </button>
        <button className={tabClass('path')} onClick={() => switchTab('path')}>
          Path to a person
        </button>
      </div>

      <form
        className={`${CARD} mb-4 grid grid-cols-1 gap-3 p-3.5 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end`}
        onSubmit={(event) => {
          event.preventDefault()
          if (tab === 'path') runPath()
          else runIntro()
        }}
      >
        <label>
          <span className={LABEL}>From</span>
          <input
            className={INPUT}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="username"
            autoComplete="off"
            required
          />
        </label>
        {tab === 'path' ? (
          <>
            <label>
              <span className={LABEL}>To</span>
              <input
                className={INPUT}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="username"
                autoComplete="off"
                required
              />
            </label>
            <label>
              <span className={LABEL}>Max hops</span>
              <select
                className={INPUT}
                value={maxHops}
                onChange={(e) => setMaxHops(Number(e.target.value))}
              >
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              <span className={LABEL}>Min followers</span>
              <input
                className={INPUT}
                type="number"
                min={0}
                step={1000}
                value={minFollowers}
                onChange={(e) => setMinFollowers(Number(e.target.value))}
              />
            </label>
            <label>
              <span className={LABEL}>Rank by</span>
              <select
                className={INPUT}
                value={sort}
                onChange={(e) => setSort(e.target.value as IntroSort)}
              >
                <option value="balanced">Balanced</option>
                <option value="profile">Profile</option>
                <option value="warmth">Warmth</option>
              </select>
            </label>
          </>
        )}
        <button className={BUTTON} disabled={pending} type="submit">
          {pending ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error ? (
        <p className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {tab === 'path' && paths ? (
        <div className="grid gap-3">
          {paths.map((path, i) => (
            <PathCard key={i} path={path} rank={i + 1} />
          ))}
        </div>
      ) : null}

      {tab === 'intro' && intro ? (
        <div className="grid gap-5">
          {intro.connectors.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold">
                Your best connectors
              </h2>
              <div className="flex flex-wrap gap-2">
                {intro.connectors.map((c) => (
                  <span
                    key={c.person.username}
                    title={c.reaches.map((u) => `@${u}`).join(', ')}
                    className={`${CARD} px-2.5 py-1 text-xs`}
                  >
                    @{c.person.username}{' '}
                    <span className={FAINT}>
                      reaches {c.reaches.length} · tie {c.strength.toFixed(2)}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}
          <section>
            <h2 className="mb-2 text-sm font-semibold">
              {intro.targets.length} people within two hops
            </h2>
            {intro.targets.length === 0 ? (
              <p className={`text-sm ${MUTED}`}>
                Nobody matches. Lower the follower minimum.
              </p>
            ) : (
              <div className="grid gap-2">
                {intro.targets.map((t) => {
                  const isOpen = open === t.person.username
                  return (
                    <div key={t.person.username} className={`${CARD} p-3`}>
                      <button
                        className="flex w-full items-start justify-between gap-3 text-left"
                        onClick={() =>
                          setOpen(isOpen ? null : t.person.username)
                        }
                      >
                        <span className="min-w-0">
                          <span className="font-semibold">
                            @{t.person.username}
                          </span>{' '}
                          <span className={`text-xs ${FAINT}`}>
                            {fmt(t.person.followers)} followers
                          </span>
                          <span className={`block text-xs ${MUTED}`}>
                            via{' '}
                            {t.routes
                              .map((r) =>
                                r.people
                                  .slice(1, -1)
                                  .map((p) => `@${p.username}`)
                                  .join(' → '),
                              )
                              .join(', ')}
                          </span>
                        </span>
                        <span className={`shrink-0 text-xs ${MUTED}`}>
                          {t.score.toFixed(3)}
                        </span>
                      </button>
                      {isOpen ? (
                        <div className="mt-3 grid gap-2">
                          {t.routes.map((route, i) => (
                            <PathCard key={i} path={route} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {graph ? <GraphNote graph={graph} /> : null}
    </div>
  )
}
