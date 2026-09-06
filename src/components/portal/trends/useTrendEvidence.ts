'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cachedTrendEvidence,
  hasCompleteTrendEvidence,
  storeTrendEvidence,
  trendEvidenceCacheKey,
  trendEvidenceNextOffset,
  type TrendEvidenceCacheEntry,
  type TrendEvidenceRange,
  type TrendEvidenceSort,
} from '@/lib/portal/trendEvidenceCache'
import { requestTrendEvidence, type FeedResponse } from './requests'
import { sameEvidenceRange } from './model'

const EVIDENCE_PAGE_SIZE = 30
const RANGE_QUERY_DEBOUNCE_MS = 1_200

export function useTrendEvidence({
  includeTerms,
  selectedEvidenceRange,
  isSelectingRange,
}: {
  includeTerms: string[]
  selectedEvidenceRange: TrendEvidenceRange | null
  isSelectingRange: boolean
}) {
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(true)
  const [isLoadingMoreEvidence, setIsLoadingMoreEvidence] = useState(false)
  const [evidenceSort, setEvidenceSort] = useState<TrendEvidenceSort>('newest')
  const [feedError, setFeedError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [requestedRange, setRequestedRange] =
    useState<TrendEvidenceRange | null>(selectedEvidenceRange)
  const [, setEvidenceCacheVersion] = useState(0)
  const evidenceScrollRef = useRef<HTMLDivElement>(null)
  const evidenceSentinelRef = useRef<HTMLDivElement>(null)
  const evidenceCacheRef = useRef<Map<string, TrendEvidenceCacheEntry>>(
    new Map(),
  )
  const evidenceRequestsRef = useRef(
    new Map<
      string,
      { controller: AbortController; promise: Promise<FeedResponse> }
    >(),
  )
  const evidenceRequestSignatureRef = useRef('')
  const handledRefreshKeyRef = useRef(0)

  useEffect(() => {
    const requests = evidenceRequestsRef.current
    return () => {
      requests.forEach(({ controller }) => controller.abort())
      requests.clear()
    }
  }, [])

  useEffect(() => {
    if (
      isSelectingRange ||
      sameEvidenceRange(selectedEvidenceRange, requestedRange)
    ) {
      return
    }
    setFeedError(null)
    const timeout = window.setTimeout(
      () => setRequestedRange(selectedEvidenceRange),
      RANGE_QUERY_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [isSelectingRange, requestedRange, selectedEvidenceRange])

  useEffect(() => {
    const signature = JSON.stringify({
      includeTerms,
      requestedRange,
      refreshKey,
      evidenceSort,
    })
    evidenceRequestSignatureRef.current = signature
    if (includeTerms.length === 0) {
      setFeedError(null)
      setIsLoadingEvidence(false)
      return
    }

    const forceRefresh = refreshKey !== handledRefreshKeyRef.current
    handledRefreshKeyRef.current = refreshKey
    const termsToLoad = includeTerms.filter(
      (term) =>
        forceRefresh ||
        !hasCompleteTrendEvidence(
          evidenceCacheRef.current,
          term,
          requestedRange,
          EVIDENCE_PAGE_SIZE,
          evidenceSort,
        ),
    )
    if (termsToLoad.length === 0) {
      setFeedError(null)
      setIsLoadingEvidence(false)
      return
    }

    const loadEvidence = async () => {
      setIsLoadingEvidence(true)
      setFeedError(null)
      const results: PromiseSettledResult<FeedResponse>[] = []
      for (const term of termsToLoad) {
        const cacheKey = trendEvidenceCacheKey(
          term,
          requestedRange,
          evidenceSort,
        )
        const requestKey = `${cacheKey}\u0000initial`
        let request = evidenceRequestsRef.current.get(requestKey)
        if (!request) {
          const controller = new AbortController()
          let promise: Promise<FeedResponse>
          promise = requestTrendEvidence(
            term,
            requestedRange,
            evidenceSort,
            0,
            controller.signal,
          )
            .then((page) => {
              storeTrendEvidence(evidenceCacheRef.current, {
                term,
                range: requestedRange,
                sort: evidenceSort,
                tweets: page.tweets,
                nextOffset: page.nextOffset,
              })
              setEvidenceCacheVersion((version) => version + 1)
              return page
            })
            .finally(() => {
              if (
                evidenceRequestsRef.current.get(requestKey)?.promise === promise
              ) {
                evidenceRequestsRef.current.delete(requestKey)
              }
            })
          request = { controller, promise }
          evidenceRequestsRef.current.set(requestKey, request)
        }
        try {
          results.push({ status: 'fulfilled', value: await request.promise })
        } catch (reason) {
          results.push({ status: 'rejected', reason })
        }
      }
      if (evidenceRequestSignatureRef.current !== signature) return
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      )
      if (failure) {
        setFeedError(
          failure.reason instanceof Error
            ? failure.reason.message
            : 'Could not load matching tweets',
        )
      }
      setIsLoadingEvidence(false)
    }

    void loadEvidence()
  }, [evidenceSort, includeTerms, refreshKey, requestedRange])

  const hasMoreEvidence = includeTerms.some(
    (term) =>
      typeof trendEvidenceNextOffset(
        evidenceCacheRef.current,
        term,
        requestedRange,
        evidenceSort,
      ) === 'number',
  )

  const loadMoreEvidence = useCallback(async () => {
    if (
      isLoadingEvidence ||
      isLoadingMoreEvidence ||
      !sameEvidenceRange(selectedEvidenceRange, requestedRange)
    ) {
      return
    }
    const pages = includeTerms.flatMap((term) => {
      const offset = trendEvidenceNextOffset(
        evidenceCacheRef.current,
        term,
        requestedRange,
        evidenceSort,
      )
      return typeof offset === 'number' ? [{ term, offset }] : []
    })
    if (pages.length === 0) return

    setIsLoadingMoreEvidence(true)
    setFeedError(null)
    const signature = evidenceRequestSignatureRef.current
    const failures: unknown[] = []
    for (const { term, offset } of pages) {
      const cacheKey = trendEvidenceCacheKey(term, requestedRange, evidenceSort)
      const requestKey = `${cacheKey}\u0000${offset}`
      let request = evidenceRequestsRef.current.get(requestKey)
      if (!request) {
        const controller = new AbortController()
        let promise: Promise<FeedResponse>
        promise = requestTrendEvidence(
          term,
          requestedRange,
          evidenceSort,
          offset,
          controller.signal,
        )
          .then((page) => {
            storeTrendEvidence(
              evidenceCacheRef.current,
              {
                term,
                range: requestedRange,
                sort: evidenceSort,
                tweets: page.tweets,
                nextOffset: page.nextOffset,
              },
              { append: true },
            )
            setEvidenceCacheVersion((version) => version + 1)
            return page
          })
          .finally(() => {
            if (
              evidenceRequestsRef.current.get(requestKey)?.promise === promise
            ) {
              evidenceRequestsRef.current.delete(requestKey)
            }
          })
        request = { controller, promise }
        evidenceRequestsRef.current.set(requestKey, request)
      }
      try {
        await request.promise
      } catch (error) {
        failures.push(error)
      }
    }
    if (
      failures.length > 0 &&
      evidenceRequestSignatureRef.current === signature
    ) {
      const failure = failures[0]
      setFeedError(
        failure instanceof Error
          ? failure.message
          : 'Could not load more matching tweets',
      )
    }
    setIsLoadingMoreEvidence(false)
  }, [
    evidenceSort,
    includeTerms,
    isLoadingEvidence,
    isLoadingMoreEvidence,
    requestedRange,
    selectedEvidenceRange,
  ])

  useEffect(() => {
    const root = evidenceScrollRef.current
    const target = evidenceSentinelRef.current
    if (
      !root ||
      !target ||
      !hasMoreEvidence ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreEvidence()
        }
      },
      { root, rootMargin: '160px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMoreEvidence, loadMoreEvidence])

  useEffect(() => {
    if (evidenceScrollRef.current) evidenceScrollRef.current.scrollTop = 0
  }, [evidenceSort, selectedEvidenceRange])

  const evidence = cachedTrendEvidence(
    evidenceCacheRef.current,
    includeTerms,
    selectedEvidenceRange,
    evidenceSort,
  )
  const isUpdatingEvidence =
    includeTerms.length > 0 &&
    (isLoadingEvidence ||
      (!sameEvidenceRange(selectedEvidenceRange, requestedRange) &&
        includeTerms.some(
          (term) =>
            !hasCompleteTrendEvidence(
              evidenceCacheRef.current,
              term,
              selectedEvidenceRange,
              EVIDENCE_PAGE_SIZE,
              evidenceSort,
            ),
        )))

  const selectEvidenceSort = (sort: TrendEvidenceSort) => {
    setFeedError(null)
    setEvidenceSort(sort)
  }
  const refreshEvidence = () => {
    setRequestedRange(selectedEvidenceRange)
    setRefreshKey((key) => key + 1)
  }
  return {
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
  }
}
