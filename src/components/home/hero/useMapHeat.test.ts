import { QueryClient } from '@tanstack/react-query'
import { MAP_VERSION } from '@/lib/hexMap/version'
import { mapHeatOptions, preloadTrendHeat } from './useMapHeat'

const payload = {
  version: MAP_VERSION,
  term: 'example',
  months: ['2026-09-01', '2026-10-01'],
  values: [
    [1, 0, 2, 8],
    [2, 1, 3, 6],
    [3, 1, 1, 0],
  ],
  from: '',
  to: '',
}
const originalFetch = global.fetch
let client: QueryClient
beforeEach(() => {
  client = new QueryClient()
})
afterEach(() => {
  client.clear()
  global.fetch = originalFetch
})

it('shares preloaded heat with immediate interaction and prepares every month', async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => payload,
  })) as unknown as typeof fetch
  await preloadTrendHeat(
    client,
    ['Example', 'example'],
    new AbortController().signal,
  )
  const result = await client.fetchQuery(mapHeatOptions(' EXAMPLE '))
  expect(global.fetch).toHaveBeenCalledTimes(1)
  expect(result.byMonth[0].get(1)).toBe(0.25)
  expect(result.byMonth[1].get(2)).toBe(0.5)
  expect(result.byMonth[1].get(3)).toBe(0)
})

it('limits background reads to two and stops queued work after unmount', async () => {
  const controller = new AbortController()
  const release: (() => void)[] = []
  global.fetch = jest.fn(
    () =>
      new Promise((resolve) =>
        release.push(() => resolve({ ok: true, json: async () => payload })),
      ),
  ) as unknown as typeof fetch
  const work = preloadTrendHeat(client, ['a', 'b', 'c', 'd'], controller.signal)
  expect(global.fetch).toHaveBeenCalledTimes(2)
  controller.abort()
  release.forEach((done) => done())
  await work
  expect(global.fetch).toHaveBeenCalledTimes(2)
})

it('does not turn a failed precompute into a cached empty heatmap', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({ ok: true, json: async () => payload })
  await preloadTrendHeat(client, ['example'], new AbortController().signal)
  expect(
    client.getQueryData(mapHeatOptions('example').queryKey),
  ).toBeUndefined()
  await client.fetchQuery(mapHeatOptions('example'))
  expect(global.fetch).toHaveBeenCalledTimes(2)
})
