'use client'
import { useCallback, useEffect, useRef } from 'react'
import { queryOptions, useQueryClient } from '@tanstack/react-query'
import type { HexSnapshot } from '@/lib/hexMap/types'
import type { MapLookup } from '@/lib/hexMap/gateway'
import { mapUrl } from '@/lib/hexMap/version'
import { prefetchMapFeed, selectionFeedPath } from './useMapFeed'

export function selectionPeopleOptions(ids: string) {
  return queryOptions({
    queryKey: ['hex-selection-people', ids],
    queryFn: async ({ signal }): Promise<MapLookup> => {
      const response = await fetch(mapUrl(`lookup?cells=${ids}`), { signal })
      if (!response.ok) throw new Error('Locations unavailable')
      return response.json()
    },
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

export function useSelectionPreview(tab: string, snapshot?: HexSnapshot) {
  const client = useQueryClient()
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const preloadSelection = useCallback(
    (cells: number[], nextTab = tab) => {
      if (!cells.length) return
      const ids = [...cells].sort((a, b) => a - b).join(',')
      void prefetchMapFeed(client, selectionFeedPath(nextTab, ids), snapshot)
      void client.prefetchQuery(selectionPeopleOptions(ids))
    },
    [client, snapshot, tab],
  )
  const onSelectionIntent = useCallback(
    (cells: number[] | null) => {
      clearTimeout(timer.current)
      // A brief dwell avoids launching reads for every cluster crossed by a drag
      // or pointer sweep. Only the current tab and six-avatar header are warmed.
      if (cells?.length)
        timer.current = setTimeout(() => preloadSelection(cells), 180)
    },
    [preloadSelection],
  )
  useEffect(() => () => clearTimeout(timer.current), [preloadSelection])
  return { onSelectionIntent, preloadSelection }
}
