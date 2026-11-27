import { RunDeadlineError } from './deadline'
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

describe('a task waiting for its turn', () => {
  const hold = (ms: number) => () =>
    new Promise<string>((resolve) => setTimeout(() => resolve('held'), ms))

  test('gives up when the run’s deadline passes, and its place goes to the next', async () => {
    const slots = createSlots(1)
    const first = slots.run(hold(60))
    const started = Date.now()
    const late = slots.run(async () => 'late', { deadlineAt: Date.now() + 15 })
    const patient = slots.run(async () => 'patient')
    await expect(late).rejects.toBeInstanceOf(RunDeadlineError)
    // It did not wait for the slot to come free.
    expect(Date.now() - started).toBeLessThan(55)
    await expect(first).resolves.toBe('held')
    await expect(patient).resolves.toBe('patient')
    // The slot is free again afterwards.
    await expect(slots.run(async () => 'after')).resolves.toBe('after')
  })

  test('a stop with no reason still rejects with an error', async () => {
    const slots = createSlots(1)
    const first = slots.run(hold(30))
    // A signal whose reason is undefined, as a hand-made one can be.
    let abort = () => {}
    const signal = {
      aborted: false,
      reason: undefined,
      addEventListener: (_type: string, listener: () => void) => {
        abort = listener
      },
      removeEventListener: () => {},
    } as unknown as AbortSignal
    const waiting = slots.run(async () => 'never', { abortSignal: signal })
    abort()
    await expect(waiting).rejects.toBeInstanceOf(RunDeadlineError)
    await expect(first).resolves.toBe('held')
  })

  test('gives up as soon as the run is stopped', async () => {
    const slots = createSlots(1)
    const first = slots.run(hold(60))
    const stop = new AbortController()
    const waiting = slots.run(async () => 'never', { abortSignal: stop.signal })
    const ran = jest.fn(async () => 'never')
    stop.abort(new Error('stopped'))
    await expect(waiting).rejects.toThrow('stopped')
    // Already stopped or out of time: it never joins the queue.
    await expect(slots.run(ran, { abortSignal: stop.signal })).rejects.toThrow(
      'stopped',
    )
    await expect(
      slots.run(ran, { deadlineAt: Date.now() - 1 }),
    ).rejects.toBeInstanceOf(RunDeadlineError)
    expect(ran).not.toHaveBeenCalled()
    await expect(first).resolves.toBe('held')
  })

  test('a task that gets its turn in time is not interrupted by the deadline', async () => {
    const slots = createSlots(1)
    const first = slots.run(hold(10))
    const second = slots.run(hold(40), { deadlineAt: Date.now() + 25 })
    await expect(first).resolves.toBe('held')
    // It started before the deadline; what it then does is its own business.
    await expect(second).resolves.toBe('held')
  })
})
