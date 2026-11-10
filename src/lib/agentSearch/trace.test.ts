import {
  inPhase,
  startTrace,
  summarizeTrace,
  traced,
  unionMs,
  type CallTrace,
} from './trace'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('command trace', () => {
  test('unionMs counts overlapping time once', () => {
    expect(unionMs([])).toBe(0)
    expect(
      unionMs([
        [0, 10],
        [5, 15],
        [20, 30],
        [21, 22],
      ]),
    ).toBe(25)
  })

  test('without a trace, calls run untimed', async () => {
    await expect(traced({}, 'gateway', 'search', async () => 7)).resolves.toBe(
      7,
    )
    await expect(inPhase(undefined, 'search', async () => 8)).resolves.toBe(8)
  })

  test('records calls under the phase they ran in, failed ones too', async () => {
    const trace: CallTrace = startTrace()
    const limits = { trace }
    await inPhase(limits, 'score', async () => {
      await inPhase(limits, 'rebuild', () =>
        traced(limits, 'gateway', 'tweets', async () => 1),
      )
      await traced(limits, 'scorer', 'decisions', async () => 2)
    })
    await expect(
      traced(limits, 'gateway', 'search', async () => {
        throw new Error('down')
      }),
    ).rejects.toThrow('down')

    const byLabel = Object.fromEntries(trace.spans.map((s) => [s.label, s]))
    expect(byLabel.tweets).toMatchObject({ kind: 'gateway', phase: 'rebuild' })
    expect(byLabel.decisions).toMatchObject({ kind: 'scorer', phase: 'score' })
    expect(byLabel.rebuild).toMatchObject({ kind: 'phase', phase: 'score' })
    expect(byLabel.search).toMatchObject({ phase: 'shell', ok: false })
    expect(trace.phases).toEqual([])
  })

  test('summarizes parallel calls by summed and wall time', async () => {
    const trace = startTrace()
    const limits = { trace }
    await inPhase(limits, 'search', () =>
      Promise.all(
        [30, 30, 30].map((ms) =>
          traced(limits, 'gateway', 'search', () => sleep(ms)),
        ),
      ),
    )
    await sleep(20)
    const timing = summarizeTrace(trace, {
      ms: Date.now() - trace.t0,
      execMs: 0,
      pageMs: 0,
    })
    expect(timing.gateway.calls).toBe(3)
    expect(timing.gateway.sumMs).toBeGreaterThanOrEqual(85)
    // In flight together, so wall time is about one call.
    expect(timing.gateway.wallMs).toBeLessThan(timing.gateway.sumMs / 2)
    expect(timing.localMs).toBeGreaterThanOrEqual(15)
    expect(timing.phases.search).toBeGreaterThanOrEqual(25)
    expect(timing.scorer).toEqual({ calls: 0, sumMs: 0, wallMs: 0, failed: 0 })
    expect(timing.spans[0][0]).toBe('phase')
  })
})
