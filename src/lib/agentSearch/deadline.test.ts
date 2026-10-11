import {
  agentSearchRunDeadlineMs,
  boundedTimeoutMs,
  callTimeoutMs,
  deadlinePassed,
  DEFAULT_RUN_DEADLINE_MS,
  RunDeadlineError,
} from './deadline'

describe('run deadline', () => {
  test('reads the deadline from the environment, ignoring bad values', () => {
    const env = (value?: string) =>
      ({ AGENT_SEARCH_RUN_DEADLINE_MS: value }) as unknown as NodeJS.ProcessEnv
    expect(agentSearchRunDeadlineMs(env())).toBe(DEFAULT_RUN_DEADLINE_MS)
    expect(agentSearchRunDeadlineMs(env('120000'))).toBe(120_000)
    for (const bad of ['', 'soon', '0', '-5'])
      expect(agentSearchRunDeadlineMs(env(bad))).toBe(DEFAULT_RUN_DEADLINE_MS)
  })

  test('cuts each call’s timeout to the time left', () => {
    expect(callTimeoutMs({}, 20_000, 0)).toBe(20_000)
    expect(callTimeoutMs({ deadlineAt: 50_000 }, 20_000, 0)).toBe(20_000)
    expect(callTimeoutMs({ deadlineAt: 50_000 }, 20_000, 45_000)).toBe(5_000)
  })

  test('starts no call once the deadline or an abort has passed', () => {
    expect(() => callTimeoutMs({ deadlineAt: 50_000 }, 20_000, 50_000)).toThrow(
      RunDeadlineError,
    )
    const aborted = AbortSignal.abort()
    expect(deadlinePassed({ abortSignal: aborted })).toBe(true)
    expect(() => callTimeoutMs({ abortSignal: aborted }, 20_000)).toThrow(
      'time limit',
    )
    // The non-throwing form still never returns zero or less.
    expect(boundedTimeoutMs({ deadlineAt: 50_000 }, 20_000, 60_000)).toBe(1)
  })
})
