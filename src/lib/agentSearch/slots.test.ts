import { createSlots, inSearchSlot } from './slots'

const tick = () => new Promise((resolve) => setTimeout(resolve, 2))

test('runs at most `size` tasks at once, the rest in the order they came', async () => {
  const slots = createSlots(3)
  let inFlight = 0
  let peak = 0
  const started: number[] = []
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      slots.run(async () => {
        started.push(i)
        peak = Math.max(peak, ++inFlight)
        await tick()
        inFlight--
        return i * 2
      }),
    ),
  )
  expect(peak).toBe(3)
  expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18])
})

test('a task that throws gives its slot back', async () => {
  const slots = createSlots(1)
  await expect(
    slots.run(async () => {
      throw new Error('boom')
    }),
  ).rejects.toThrow('boom')
  await expect(slots.run(async () => 'next')).resolves.toBe('next')
})

test('inSearchSlot runs the task directly when the limits carry no slots', async () => {
  await expect(inSearchSlot(undefined, async () => 1)).resolves.toBe(1)
  await expect(inSearchSlot({}, async () => 2)).resolves.toBe(2)
  const slots = { run: jest.fn(async (task: () => Promise<unknown>) => task()) }
  await expect(
    inSearchSlot({ searchSlots: slots as never }, async () => 3),
  ).resolves.toBe(3)
  expect(slots.run).toHaveBeenCalledTimes(1)
})
