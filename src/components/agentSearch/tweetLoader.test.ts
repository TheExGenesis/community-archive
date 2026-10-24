import type { AgentTweet } from '@/lib/agentSearch/types'
import type { TweetLoad } from './messageView'
import {
  createTweetLoader,
  TweetRequestError,
  type BatchResult,
} from './tweetLoader'

const tweet = (id: string) =>
  ({ id, text: `Post ${id}`, username: `u${id}` }) as AgentTweet

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A fetch that answers from a script, one entry per call, in order. */
const scripted = (script: Array<(ids: string[]) => BatchResult | Error>) => {
  const calls: string[][] = []
  const fetchBatch = jest.fn(async (ids: string[]) => {
    calls.push(ids)
    const step = script[Math.min(calls.length - 1, script.length - 1)]
    const result = step(ids)
    if (result instanceof Error) throw result
    return result
  })
  return { calls, fetchBatch }
}

const all = (ids: string[]): BatchResult => ({
  tweets: ids.map(tweet),
  failed: [],
})

function recorder() {
  const batches: Array<{
    tweets: string[]
    states: Record<string, TweetLoad>
  }> = []
  const onBatch = (tweets: AgentTweet[], states: Map<string, TweetLoad>) =>
    batches.push({
      tweets: tweets.map((t) => t.id),
      states: Object.fromEntries(states),
    })
  return { batches, onBatch }
}

test('fetches in order, a small first batch then larger ones, and reports each as it lands', async () => {
  const { calls, fetchBatch } = scripted([all])
  const { batches, onBatch } = recorder()
  const sleeps: number[] = []
  const loader = createTweetLoader({
    fetchBatch,
    onBatch,
    firstBatch: 2,
    batch: 3,
    inFlight: 1,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
  })
  loader.load(['1', '2', '3', '4', '5', '6', '7'])
  await flush()
  expect(calls).toEqual([
    ['1', '2'],
    ['3', '4', '5'],
    ['6', '7'],
  ])
  expect(batches.map((b) => b.tweets)).toEqual([
    ['1', '2'],
    ['3', '4', '5'],
    ['6', '7'],
  ])
  expect(sleeps).toEqual([])
})

test('an id the server returns nothing for is unavailable; one it reports failed is tried again', async () => {
  const { calls, fetchBatch } = scripted([
    (ids) => ({ tweets: [tweet('1')], failed: ['3'] }),
    all,
  ])
  const { batches, onBatch } = recorder()
  const sleeps: number[] = []
  const loader = createTweetLoader({
    fetchBatch,
    onBatch,
    firstBatch: 3,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
  })
  loader.load(['1', '2', '3'])
  await flush()
  await flush()
  expect(calls).toEqual([['1', '2', '3'], ['3']])
  expect(batches[0]).toEqual({ tweets: ['1'], states: { '2': 'unavailable' } })
  expect(batches[1]).toEqual({ tweets: ['3'], states: {} })
  expect(sleeps).toEqual([500])
})

test('a batch that fails is retried with backoff, then marked failed; Retry asks again', async () => {
  const { calls, fetchBatch } = scripted([
    () => new Error('network'),
    () => new TweetRequestError(503),
    () => new Error('network'),
    all,
  ])
  const { batches, onBatch } = recorder()
  const sleeps: number[] = []
  const loader = createTweetLoader({
    fetchBatch,
    onBatch,
    attempts: 3,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
  })
  loader.load(['1', '2'])
  for (let i = 0; i < 6; i++) await flush()
  expect(calls).toEqual([
    ['1', '2'],
    ['1', '2'],
    ['1', '2'],
  ])
  expect(sleeps).toEqual([500, 2000])
  expect(batches).toEqual([
    { tweets: [], states: { '1': 'failed', '2': 'failed' } },
  ])

  loader.retry()
  for (let i = 0; i < 3; i++) await flush()
  expect(calls).toHaveLength(4)
  expect(batches.slice(1)).toEqual([
    { tweets: [], states: { '1': 'loading', '2': 'loading' } },
    { tweets: ['1', '2'], states: {} },
  ])
  // Nothing left to retry.
  loader.retry()
  await flush()
  expect(calls).toHaveLength(4)
})

test('a refused request (4xx) is not tried again', async () => {
  const { calls, fetchBatch } = scripted([() => new TweetRequestError(400)])
  const { batches, onBatch } = recorder()
  const loader = createTweetLoader({
    fetchBatch,
    onBatch,
    sleep: async () => {},
  })
  loader.load(['1'])
  await flush()
  await flush()
  expect(calls).toEqual([['1']])
  expect(batches).toEqual([{ tweets: [], states: { '1': 'failed' } }])
})

test('once stopped, nothing more is fetched or reported', async () => {
  let release: (value: BatchResult) => void = () => {}
  const fetchBatch = jest.fn(
    () => new Promise<BatchResult>((resolve) => (release = resolve)),
  )
  const { batches, onBatch } = recorder()
  const loader = createTweetLoader({
    fetchBatch,
    onBatch,
    firstBatch: 1,
    inFlight: 1,
  })
  loader.load(['1', '2'])
  await flush()
  expect(fetchBatch).toHaveBeenCalledTimes(1)
  loader.stop()
  release(all(['1']))
  await flush()
  expect(batches).toEqual([])
  expect(fetchBatch).toHaveBeenCalledTimes(1)
  loader.load(['3'])
  await flush()
  expect(fetchBatch).toHaveBeenCalledTimes(1)
})
