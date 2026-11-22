/**
 * An in-memory value shared by every request on one server instance.
 *
 * Fresh values are returned as they are. Once a value is older than `freshMs`
 * it is still returned, but a single background rebuild starts; once it is
 * older than `maxStaleMs` callers wait for the rebuild instead. Concurrent
 * callers share one build. A failed build keeps the previous value (within
 * `maxStaleMs`) and the next caller retries.
 */
export function createSharedCache<T>(
  build: () => Promise<T>,
  {
    freshMs,
    maxStaleMs,
    now = Date.now,
    background = (work: Promise<unknown>) => void work.catch(() => {}),
  }: {
    freshMs: number
    maxStaleMs: number
    now?: () => number
    /** Keep the instance alive for a rebuild that outlives the request. */
    background?: (work: Promise<unknown>) => void
  },
) {
  let current: { value: T; at: number } | null = null
  let pending: Promise<T> | null = null

  function rebuild() {
    if (!pending) {
      const started = now()
      pending = build()
        .then((value) => {
          current = { value, at: started }
          return value
        })
        .finally(() => {
          pending = null
        })
    }
    return pending
  }

  return {
    async get(): Promise<T> {
      const age = current ? now() - current.at : Infinity
      if (current && age < freshMs) return current.value
      if (current && age < maxStaleMs) {
        background(rebuild())
        return current.value
      }
      return rebuild()
    },
    clear() {
      current = null
    },
  }
}
