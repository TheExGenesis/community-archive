/**
 * Edge cache for the library routes. The snapshot behind them is rebuilt
 * weekly from current members, so an opted-out account leaves it at the next
 * Monday build; this window adds at most seven more hours on top of that week.
 */
export const LIBRARY_CACHE_CONTROL =
  'public, s-maxage=3600, stale-while-revalidate=21600'
