// The transport reconnects to a run's stream with no pause and gives up after
// a few failed reads, and it treats a refused reconnect (a 409 while the run
// starts, a 503 while the archive or the dev server is busy) as final. In dev
// both ended answers the run went on to finish. This fetch spaces reconnects
// that come close together and retries the refusals that pass, and the
// reconnects that never reached the server (the network dropped).

/** A reconnect to a run's stream, as the transport builds it. */
const STREAM_URL = /\/stream\?startIndex=\d+$/
/** Statuses worth asking again: starting up, rate limited, briefly down. */
const RETRY_STATUSES = new Set([409, 429, 500, 502, 503, 504])
/** Reconnects closer together than this count as one streak. */
const STREAK_WINDOW_MS = 10_000
const FIRST_DELAY_MS = 500
const MAX_DELAY_MS = 5_000
const MAX_REFUSALS = 5

const wait = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    if (ms <= 0) return resolve()
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })

const backoff = (attempt: number) =>
  attempt <= 0 ? 0 : Math.min(FIRST_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)

const isAbort = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError'

export function createReconnectingFetch(
  base: typeof fetch = (...args) => fetch(...args),
  now: () => number = Date.now,
): typeof fetch {
  let lastStart = -Infinity
  let streak = 0
  return async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const method = (init?.method ?? 'GET').toUpperCase()
    // The question itself (the paid POST) is never sent twice.
    if (method !== 'GET' || !STREAM_URL.test(url)) return base(input, init)

    const started = now()
    streak = started - lastStart < STREAK_WINDOW_MS ? streak + 1 : 0
    lastStart = started
    await wait(backoff(streak), init?.signal)

    for (let refusal = 0; ; refusal++) {
      let response: Response
      try {
        response = await base(input, init)
      } catch (error) {
        // No answer at all (the network dropped): asked again like a
        // refusal. A Stop ends it at once.
        if (init?.signal?.aborted || isAbort(error) || refusal >= MAX_REFUSALS)
          throw error
        await wait(backoff(refusal + 1), init?.signal)
        continue
      }
      if (
        response.ok ||
        !RETRY_STATUSES.has(response.status) ||
        refusal >= MAX_REFUSALS
      ) {
        return response
      }
      await wait(backoff(refusal + 1), init?.signal)
    }
  }
}
