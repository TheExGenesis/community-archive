import { AnalyticsGatewayError } from '@/lib/clickhouseGateway'
import { retryWhileBusy } from './gateway'

const busy = () =>
  new AnalyticsGatewayError(503, '{"error":"Search is busy; retry shortly."}')

test('retries a busy gateway and returns the later answer', async () => {
  const call = jest
    .fn()
    .mockRejectedValueOnce(busy())
    .mockRejectedValueOnce(busy())
    .mockResolvedValue('ok')
  await expect(retryWhileBusy({}, call, [1, 1])).resolves.toBe('ok')
  expect(call).toHaveBeenCalledTimes(3)
})

test('gives up once the retries are used', async () => {
  const call = jest.fn().mockRejectedValue(busy())
  await expect(retryWhileBusy({}, call, [1])).rejects.toThrow('(503)')
  expect(call).toHaveBeenCalledTimes(2)
})

test('does not retry other errors', async () => {
  const call = jest
    .fn()
    .mockRejectedValue(new AnalyticsGatewayError(500, 'boom'))
  await expect(retryWhileBusy({}, call, [1, 1])).rejects.toThrow('(500)')
  expect(call).toHaveBeenCalledTimes(1)
})

test('does not wait past the run deadline', async () => {
  const call = jest.fn().mockRejectedValue(busy())
  await expect(
    retryWhileBusy({ deadlineAt: Date.now() + 50 }, call, [1_000]),
  ).rejects.toThrow('(503)')
  expect(call).toHaveBeenCalledTimes(1)
})
