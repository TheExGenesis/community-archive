/**
 * Edge cache for the library routes. The snapshot behind them is rebuilt
 * daily from current members, so an opted-out account leaves it at the next
 * build; this window adds at most seven more hours on top of that day.
 */
export const LIBRARY_CACHE_CONTROL =
  'public, s-maxage=3600, stale-while-revalidate=21600'
