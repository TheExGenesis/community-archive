import { createSharedCache } from './sharedCache'

function setup() {
  let clock = 0
  let version = 0
  const build = jest.fn(async () => ++version)
  const background = jest.fn((work: Promise<unknown>) => {
    void work.catch(() => {})
  })
  const cache = createSharedCache(build, {
    freshMs: 100,
    maxStaleMs: 1000,
    now: () => clock,
    background,
  })
  return {
    cache,
    build,
    background,
    tick: (ms: number) => (clock += ms),
  }
}

test('concurrent first readers share one build, then reuse it while fresh', async () => {
  const { cache, build, tick } = setup()
  await expect(Promise.all([cache.get(), cache.get()])).resolves.toEqual([1, 1])
  tick(99)
  await expect(cache.get()).resolves.toBe(1)
  expect(build).toHaveBeenCalledTimes(1)
})

test('a stale value is served at once while one background rebuild runs', async () => {
  const { cache, build, background, tick } = setup()
  await cache.get()
  tick(150)
  await expect(Promise.all([cache.get(), cache.get()])).resolves.toEqual([1, 1])
  expect(build).toHaveBeenCalledTimes(2)
  expect(background).toHaveBeenCalled()
  await background.mock.calls[0][0]
  await expect(cache.get()).resolves.toBe(2)
})

test('past the staleness bound readers wait for fresh data', async () => {
  const { cache, background, tick } = setup()
  await cache.get()
  tick(1000)
  await expect(cache.get()).resolves.toBe(2)
  expect(background).not.toHaveBeenCalled()
})

test('a failed rebuild keeps the last value within the bound, then fails', async () => {
  const { cache, build, background, tick } = setup()
  await cache.get()
  build.mockRejectedValue(new Error('gateway down'))
  tick(150)
  await expect(cache.get()).resolves.toBe(1)
  await expect(background.mock.calls[0][0]).rejects.toThrow('gateway down')
  tick(900)
  await expect(cache.get()).rejects.toThrow('gateway down')
})
