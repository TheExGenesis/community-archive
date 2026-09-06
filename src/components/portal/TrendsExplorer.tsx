'use client'

import { useState } from 'react'
import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import ExtensionInstallPrompt from '@/components/ExtensionInstallPrompt'
import type { PortalTrends } from '@/lib/portal/types'
import { BODY, CARD, MUTED, SERIF } from './styles'
import { useTrendExplorer } from './trends/useTrendExplorer'
import { useTrendEvidence } from './trends/useTrendEvidence'
import { TrendChart } from './trends/TrendChart'
import { MAX_SERIES, SERIES_COLORS } from './trends/config'
import { bucketLabel } from './trends/model'

type FeedFilter = 'include' | 'off'

function nextFeedFilter(filter: FeedFilter): FeedFilter {
  return filter === 'off' ? 'include' : 'off'
}

function filterLabel(term: string, filter: FeedFilter): string {
  if (filter === 'include') return `${term} is included. Click to turn it off.`
  return `${term} is off. Click to include it.`
}

export default function TrendsExplorer({
  initialTrends,
  initialLoadFailed = false,
  initialSearch = '',
}: {
  initialTrends: PortalTrends
  initialLoadFailed?: boolean
  initialSearch?: string
}) {
  const {
    configuredTerms,
    granularity,
    buckets,
    series,
    chartEnabled,
    setChartEnabled,
    feedFilters,
    setFeedFilters,
    scale,
    setScale,
    termInput,
    setTermInput,
    isAdding,
    isLoadingSeries,
    isRetryingDefaults,
    addError,
    chartError,
    selectedRange,
    setSelectedRange,
    selectedEvidenceRange,
    enabledSeries,
    includeTerms,
    returnTo,
    captureExplorerAction,
    removeTerm,
    addTerms,
    retryDefaultTrends,
    selectGranularity,
  } = useTrendExplorer({ initialTrends, initialLoadFailed, initialSearch })
  const [isSelectingRange, setIsSelectingRange] = useState(false)
  const {
    evidence,
    evidenceSort,
    feedError,
    isLoadingEvidence,
    isLoadingMoreEvidence,
    isUpdatingEvidence,
    hasMoreEvidence,
    evidenceScrollRef,
    evidenceSentinelRef,
    loadMoreEvidence,
    selectEvidenceSort,
    refreshEvidence,
  } = useTrendEvidence({
    includeTerms,
    selectedEvidenceRange,
    isSelectingRange,
  })

  return (
    <main className="flex-1 bg-zinc-100/80 dark:bg-transparent">
      <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6">
        <Link
          href="/"
          className={`mb-2 inline-flex items-center text-[12.5px] font-semibold ${MUTED} hover:text-brand`}
        >
          ← Dashboard
        </Link>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[30px] font-semibold" style={SERIF}>
              Trends explorer
            </h1>
            <p className={`mt-1 max-w-[680px] text-[13.5px] ${MUTED}`}>
              Compare the archive’s vocabulary over time, then inspect the posts
              behind each line.
            </p>
          </div>
          <div className={`text-[12px] ${MUTED}`}>
            Full corpus · {initialTrends.years[0]}–{initialTrends.years.at(-1)}
          </div>
        </div>

        <ExtensionInstallPrompt surface="trends" className="mb-5" />

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)]">
          <section className="min-w-0">
            <div className={`${CARD} mb-4 p-4 sm:p-5`}>
              <form
                onSubmit={addTerms}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <label className="sr-only" htmlFor="trend-terms">
                  Words or phrases to chart
                </label>
                <input
                  id="trend-terms"
                  value={termInput}
                  onChange={(event) => setTermInput(event.target.value)}
                  placeholder="Add words or phrases, separated by commas"
                  maxLength={500}
                  className="h-10 min-w-0 flex-1 rounded-[4px] border border-zinc-300 bg-white px-3 text-[13.5px] outline-none transition-colors placeholder:text-zinc-400 focus:border-brand focus:ring-2 focus:ring-brand/15 dark:border-[#34343a] dark:bg-[#121214]"
                />
                <button
                  type="submit"
                  disabled={isAdding || isRetryingDefaults}
                  className="h-10 rounded-[4px] bg-brand px-4 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                >
                  {isAdding ? 'Adding…' : 'Add trends'}
                </button>
              </form>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`text-[11.5px] ${addError ? 'text-red-600 dark:text-red-400' : MUTED}`}
                >
                  {addError ||
                    'Multi-word trends match all words; up to four distinct words are counted.'}
                </span>
                <span className={`text-[11.5px] tabular-nums ${MUTED}`}>
                  {configuredTerms.length}/{MAX_SERIES} trends
                </span>
              </div>
            </div>

            <div className={`${CARD} overflow-hidden`}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3.5 dark:border-[#26262a] sm:px-5">
                <div>
                  <h2 className="text-[14px] font-bold">
                    {scale === 'normalized'
                      ? 'Frequency per 100k tweets'
                      : `Matching tweets by ${granularity}`}
                  </h2>
                  <p className={`mt-0.5 text-[11.5px] ${MUTED}`}>
                    {scale === 'normalized'
                      ? `Adjusted for the archive’s changing ${granularity === 'year' ? 'annual' : 'monthly'} volume.`
                      : `Raw matching tweet count in each calendar ${granularity}.`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div
                    className="inline-flex rounded-[4px] border border-zinc-300 p-0.5 dark:border-[#34343a]"
                    aria-label="Trend granularity"
                  >
                    {(['year', 'month'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={granularity === option}
                        onClick={() => selectGranularity(option)}
                        disabled={isLoadingSeries}
                        className={`rounded-[3px] px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
                          granularity === option
                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                            : `${MUTED} hover:text-foreground`
                        }`}
                      >
                        {option === 'year' ? 'Years' : 'Months'}
                      </button>
                    ))}
                  </div>
                  <div
                    className="inline-flex rounded-[4px] border border-zinc-300 p-0.5 dark:border-[#34343a]"
                    aria-label="Trend scale"
                  >
                    {(['raw', 'normalized'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={scale === option}
                        onClick={() => {
                          if (scale === option) return
                          captureExplorerAction('scale_changed')
                          setScale(option)
                        }}
                        className={`rounded-[3px] px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                          scale === option
                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                            : `${MUTED} hover:text-foreground`
                        }`}
                      >
                        {option === 'raw' ? 'Raw count' : 'Per 100k'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {chartError && (
                <div
                  className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-950 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100 sm:mx-5"
                  role="alert"
                >
                  <div className="text-[12.5px]">
                    <span className="font-bold">Chart data unavailable.</span>{' '}
                    {chartError} Retry this chart without reloading the page;
                    other dashboard areas are unaffected.
                  </div>
                  {series.length === 0 && (
                    <button
                      type="button"
                      onClick={() => void retryDefaultTrends()}
                      disabled={isRetryingDefaults}
                      className="rounded-[4px] border border-amber-400 bg-white px-2.5 py-1.5 text-[11.5px] font-bold text-amber-950 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100"
                    >
                      {isRetryingDefaults ? 'Retrying…' : 'Retry defaults'}
                    </button>
                  )}
                </div>
              )}

              <TrendChart
                buckets={buckets}
                enabledSeries={enabledSeries}
                granularity={granularity}
                scale={scale}
                selectedRange={selectedRange}
                setSelectedRange={setSelectedRange}
                isLoadingSeries={isLoadingSeries}
                seriesCount={series.length}
                captureExplorerAction={captureExplorerAction}
                onSelectingRangeChange={setIsSelectingRange}
              />

              <div className="border-t border-zinc-100 px-4 py-3 dark:border-[#202023] sm:px-5">
                <div
                  className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${MUTED}`}
                >
                  Series shown
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {configuredTerms.map((term, index) => {
                    const item = series.find((entry) => entry.term === term)
                    const active = !!chartEnabled[term]
                    const color =
                      item?.color ?? SERIES_COLORS[index % SERIES_COLORS.length]
                    return (
                      <span
                        key={term}
                        className={`inline-flex items-center overflow-hidden rounded-full border text-[12px] font-semibold transition-colors ${
                          active
                            ? 'border-zinc-400 bg-zinc-50 text-foreground dark:border-[#45454c] dark:bg-[#202024]'
                            : `border-zinc-200 bg-white dark:border-[#29292e] dark:bg-[#171719] ${MUTED}`
                        }`}
                      >
                        <button
                          type="button"
                          aria-pressed={active}
                          aria-label={`${active ? 'Hide' : 'Show'} ${term} series`}
                          onClick={() => {
                            captureExplorerAction('chart_series_toggled', {
                              enabledSeriesCount:
                                enabledSeries.length + (active ? -1 : 1),
                            })
                            setChartEnabled((current) => ({
                              ...current,
                              [term]: !current[term],
                            }))
                          }}
                          className="inline-flex items-center gap-1.5 py-1.5 pl-2.5 pr-1.5"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: color,
                              opacity: active ? 1 : 0.3,
                            }}
                          />
                          {term}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${term} trend`}
                          onClick={() => removeTerm(term)}
                          className="px-2 py-1.5 text-[14px] leading-none opacity-60 hover:opacity-100"
                        >
                          ×
                        </button>
                      </span>
                    )
                  })}
                  {configuredTerms.length === 0 && (
                    <span className={`py-1 text-[12px] ${MUTED}`}>
                      No trend series loaded.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className={`mt-3 text-[12px] leading-relaxed ${BODY}`}>
              Normalization divides each term’s {granularity} count by all
              archived tweets from that {granularity}, then scales the result to
              100,000. This makes periods with different archive coverage
              comparable.
            </p>
          </section>

          <aside className="min-w-0 lg:sticky lg:top-20">
            <div className="mb-2.5 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold" style={SERIF}>
                  Tweets counted
                </h2>
                <p className={`mt-0.5 text-[11.5px] ${MUTED}`}>
                  {selectedRange
                    ? `Posts from ${bucketLabel(selectedRange.start, granularity)}–${bucketLabel(selectedRange.end, granularity)} matching any included trend.`
                    : evidenceSort === 'newest'
                      ? 'Latest posts matching any included trend.'
                      : 'First posts matching any included trend.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="inline-flex rounded-[4px] border border-zinc-300 p-0.5 dark:border-[#34343a]"
                  aria-label="Tweet order"
                >
                  {(['newest', 'oldest'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={evidenceSort === option}
                      onClick={() => {
                        if (evidenceSort === option) return
                        captureExplorerAction('evidence_sort_changed')
                        selectEvidenceSort(option)
                      }}
                      className={`rounded-[3px] px-2 py-1 text-[10.5px] font-semibold transition-colors ${
                        evidenceSort === option
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                          : `${MUTED} hover:text-foreground`
                      }`}
                    >
                      {option === 'newest' ? 'Newest first' : 'Oldest first'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    captureExplorerAction('evidence_refreshed')
                    refreshEvidence()
                  }}
                  disabled={
                    isLoadingEvidence ||
                    isLoadingMoreEvidence ||
                    includeTerms.length === 0
                  }
                  className={`text-[11.5px] font-semibold ${MUTED} hover:text-brand disabled:opacity-40`}
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className={`${CARD} mb-3 p-3`}>
              <div className="flex flex-wrap gap-1.5">
                {configuredTerms.map((term) => {
                  const filter = feedFilters[term] ?? 'off'
                  return (
                    <span
                      key={term}
                      className={`inline-flex items-center overflow-hidden rounded-full border text-[11.5px] font-bold transition-colors ${
                        filter === 'include'
                          ? 'border-brand bg-brand/10 text-blue-700 dark:text-blue-300'
                          : `border-zinc-200 bg-white dark:border-[#29292e] dark:bg-[#171719] ${MUTED}`
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={filterLabel(term, filter)}
                        onClick={() => {
                          captureExplorerAction('evidence_filter_toggled', {
                            includedSeriesCount:
                              includeTerms.length +
                              (filter === 'include' ? -1 : 1),
                          })
                          setFeedFilters((current) => ({
                            ...current,
                            [term]: nextFeedFilter(current[term] ?? 'off'),
                          }))
                        }}
                        className="py-1.5 pl-2.5 pr-1.5"
                      >
                        {filter === 'include' ? '+ ' : ''}
                        {term}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${term} trend from explorer`}
                        onClick={() => removeTerm(term)}
                        className="px-2 py-1.5 text-[14px] leading-none opacity-60 hover:opacity-100"
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
              </div>
              <div className={`mt-2.5 text-[10.5px] leading-normal ${MUTED}`}>
                Click a pill to include it or turn it off. Included terms are
                OR.
              </div>
            </div>

            <div
              ref={evidenceScrollRef}
              className={`${CARD} max-h-[760px] overflow-y-auto`}
              aria-label="Matching tweets"
              aria-live="polite"
              onScroll={(event) => {
                const element = event.currentTarget
                if (
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <
                  160
                ) {
                  void loadMoreEvidence()
                }
              }}
            >
              {isUpdatingEvidence && evidence.length === 0 && (
                <div className={`px-4 py-12 text-center text-[13px] ${MUTED}`}>
                  Finding matching tweets…
                </div>
              )}
              {isUpdatingEvidence && evidence.length > 0 && (
                <div
                  className={`sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-2 text-[11.5px] backdrop-blur dark:border-[#29292e] dark:bg-[#171719]/95 ${MUTED}`}
                >
                  Updating this period in the background…
                </div>
              )}
              {includeTerms.length === 0 && (
                <div className={`px-4 py-12 text-center text-[13px] ${MUTED}`}>
                  Include at least one term to inspect its tweets.
                </div>
              )}
              {feedError && (
                <div className="border-b border-red-200 px-4 py-3 text-center text-[12px] text-red-600 dark:border-red-900/60 dark:text-red-400">
                  {feedError}
                </div>
              )}
              {!isUpdatingEvidence &&
                !feedError &&
                includeTerms.length > 0 &&
                evidence.length === 0 && (
                  <div
                    className={`px-4 py-12 text-center text-[13px] ${MUTED}`}
                  >
                    No matching tweets in this period.
                  </div>
                )}
              {evidence.map((tweet) => (
                <TweetCard
                  key={tweet.id}
                  tweet={tweet}
                  collapsible
                  clickable
                  origin="trends"
                  returnTo={returnTo}
                />
              ))}
              <div ref={evidenceSentinelRef} className="h-px" />
              {isLoadingMoreEvidence && (
                <div className={`px-4 py-3 text-center text-[11.5px] ${MUTED}`}>
                  Loading more tweets…
                </div>
              )}
              {!isLoadingEvidence &&
                !isLoadingMoreEvidence &&
                !feedError &&
                evidence.length > 0 &&
                !hasMoreEvidence && (
                  <div
                    className={`border-t border-zinc-100 px-4 py-3 text-center text-[10.5px] dark:border-[#202023] ${MUTED}`}
                  >
                    End of matching tweets.
                  </div>
                )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
