import { WEEKLY_TIMEOUT_RETRY, generateWeeklyDigest } from './weeklyGeneration'

const original = process.env.OPENROUTER_API_KEY
beforeAll(() => {
  process.env.OPENROUTER_API_KEY = 'openrouter-test-key'
})
afterAll(() => {
  if (original === undefined) delete process.env.OPENROUTER_API_KEY
  else process.env.OPENROUTER_API_KEY = original
})

const reply = (content: string) =>
  ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        id: 'gen',
        model: 'anthropic/claude-opus-5.5',
        choices: [{ message: { content }, finish_reason: 'stop' }],
      }),
  }) as unknown as Response

test('a timed-out call is retried once with low reasoning and a longer limit', async () => {
  const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' })
  const fetchImpl = jest
    .fn()
    .mockRejectedValueOnce(timeout)
    .mockResolvedValue(reply('{}'))
  const onTimeout = jest.fn()

  await expect(
    generateWeeklyDigest({
      weekStart: '2026-10-26',
      editions: [],
      priorWeeks: [],
      fetchImpl,
      onTimeout,
    }),
  ).rejects.toThrow()

  expect(onTimeout).toHaveBeenCalledTimes(1)
  const bodies = fetchImpl.mock.calls.map(([, init]) =>
    JSON.parse((init as RequestInit).body as string),
  )
  expect(bodies[0].reasoning.effort).toBe('medium')
  expect(bodies[1].reasoning.effort).toBe(WEEKLY_TIMEOUT_RETRY.reasoningEffort)
  // The repair attempt starts at the normal effort again.
  expect(bodies[2].reasoning.effort).toBe('medium')
})

test('a slow body counts as a timeout too', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () =>
        Promise.reject(
          Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
        ),
    })
    .mockResolvedValue(reply('{}'))
  const onTimeout = jest.fn()
  await expect(
    generateWeeklyDigest({
      weekStart: '2026-10-26',
      editions: [],
      priorWeeks: [],
      fetchImpl,
      onTimeout,
    }),
  ).rejects.toThrow()
  expect(onTimeout).toHaveBeenCalledWith(
    expect.objectContaining({ timeoutMs: 240_000 }),
  )
})
