import { createReconnectingFetch } from './reconnectingFetch'

const STREAM = '/api/agent-search/asr_1/stream?startIndex=12'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test('requests other than stream reconnects pass straight through', async () => {
  const base = jest.fn(async () => new Response('ok'))
  const f = createReconnectingFetch(base as unknown as typeof fetch)
  await f('/api/agent-search', { method: 'POST' })
  await f('/api/agent-search/conversations')
  expect(base).toHaveBeenCalledTimes(2)
})

test('reconnects close together wait longer each time', async () => {
  let clock = 0
  const base = jest.fn(async () => new Response('ok'))
  const f = createReconnectingFetch(
    base as unknown as typeof fetch,
    () => clock,
  )
  await f(STREAM) // first: no wait
  expect(base).toHaveBeenCalledTimes(1)
  clock = 1_000
  const second = f(STREAM)
  await jest.advanceTimersByTimeAsync(499)
  expect(base).toHaveBeenCalledTimes(1)
  await jest.advanceTimersByTimeAsync(1)
  await second
  expect(base).toHaveBeenCalledTimes(2)
  // A reconnect long after the last starts a new streak: no wait.
  clock = 60_000
  await f(STREAM)
  expect(base).toHaveBeenCalledTimes(3)
})

test('a refusal that may pass is asked again; a real refusal is not', async () => {
  const responses = [
    new Response('busy', { status: 503 }),
    new Response('starting', { status: 409 }),
    new Response('stream'),
  ]
  const base = jest.fn(async () => responses.shift() as Response)
  const f = createReconnectingFetch(base as unknown as typeof fetch)
  const pending = f(STREAM)
  await jest.advanceTimersByTimeAsync(5_000)
  expect((await pending).status).toBe(200)
  expect(base).toHaveBeenCalledTimes(3)

  const notFound = jest.fn(async () => new Response('gone', { status: 404 }))
  const g = createReconnectingFetch(notFound as unknown as typeof fetch)
  expect((await g(STREAM)).status).toBe(404)
  expect(notFound).toHaveBeenCalledTimes(1)
})

test('a reconnect that never reached the server is asked again, with a limit', async () => {
  // The network drops while reconnecting: fetch rejects instead of answering.
  const responses: Array<Response | Error> = [
    new TypeError('Failed to fetch'),
    new TypeError('Failed to fetch'),
    new Response('stream'),
  ]
  const base = jest.fn(async () => {
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next as Response
  })
  const f = createReconnectingFetch(base as unknown as typeof fetch)
  const pending = f(STREAM)
  await jest.advanceTimersByTimeAsync(5_000)
  expect((await pending).status).toBe(200)
  expect(base).toHaveBeenCalledTimes(3)

  // Still down after the retries: the error reaches the transport.
  const down = jest.fn(async () => {
    throw new TypeError('Failed to fetch')
  })
  const g = createReconnectingFetch(down as unknown as typeof fetch)
  const failing = g(STREAM)
  // Jest must see the rejection handled before the timers advance.
  const outcome = failing.catch((error: Error) => error.message)
  await jest.advanceTimersByTimeAsync(60_000)
  expect(await outcome).toBe('Failed to fetch')
  expect(down).toHaveBeenCalledTimes(6)
})

test('a dropped connection is not retried once the answer is stopped, and the question itself is never retried', async () => {
  const controller = new AbortController()
  const base = jest.fn(async () => {
    controller.abort(new Error('stopped'))
    throw Object.assign(new Error('aborted'), { name: 'AbortError' })
  })
  const f = createReconnectingFetch(base as unknown as typeof fetch)
  await expect(f(STREAM, { signal: controller.signal })).rejects.toThrow(
    'aborted',
  )
  expect(base).toHaveBeenCalledTimes(1)

  const post = jest.fn(async () => {
    throw new TypeError('Failed to fetch')
  })
  const g = createReconnectingFetch(post as unknown as typeof fetch)
  await expect(g('/api/agent-search', { method: 'POST' })).rejects.toThrow(
    'Failed to fetch',
  )
  expect(post).toHaveBeenCalledTimes(1)
})

test('stopping the answer cancels a wait', async () => {
  let clock = 0
  const base = jest.fn(async () => new Response('ok'))
  const f = createReconnectingFetch(
    base as unknown as typeof fetch,
    () => clock,
  )
  await f(STREAM)
  clock = 100
  const controller = new AbortController()
  const pending = f(STREAM, { signal: controller.signal })
  controller.abort(new Error('stopped'))
  await expect(pending).rejects.toThrow('stopped')
  expect(base).toHaveBeenCalledTimes(1)
})
