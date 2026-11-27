const mockCaptureException = jest.fn()
const mockFlush = jest.fn(async () => undefined)
jest.mock('posthog-node', () => ({
  PostHog: class {
    captureException = mockCaptureException
    flush = mockFlush
  },
}))

import {
  __resetServerErrorCaptureForTests,
  captureServerException,
  serverDistinctId,
} from './serverErrorCapture'

describe('captureServerException', () => {
  const env = process.env
  beforeEach(() => {
    jest.clearAllMocks()
    __resetServerErrorCaptureForTests()
    process.env = {
      ...env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_test',
      VERCEL_ENV: 'preview',
    }
    delete process.env.SERVER_ERROR_CAPTURE
  })
  afterAll(() => {
    process.env = env
  })

  test('uses the personless server id by default', async () => {
    const error = new Error('boom')
    await expect(
      captureServerException(error, { route: '/api/x', method: 'GET' }),
    ).resolves.toBe(true)
    expect(mockCaptureException).toHaveBeenCalledWith(
      error,
      serverDistinctId(),
      expect.objectContaining({
        route: '/api/x',
        side: 'server',
        environment: 'preview',
        $process_person_profile: false,
      }),
    )
    expect(mockFlush).toHaveBeenCalled()
  })

  test('attributes to a verified account id without the personless flag', async () => {
    await captureServerException(new Error('boom'), {
      route: '/api/x',
      distinctId: 'user-123',
      userState: 'signed_in',
    })
    const [, distinctId, properties] = mockCaptureException.mock.calls[0]
    expect(distinctId).toBe('user-123')
    expect(properties).not.toHaveProperty('$process_person_profile')
    expect(properties.user_state).toBe('signed_in')
  })

  test('honours the kill switch', async () => {
    process.env.SERVER_ERROR_CAPTURE = 'off'
    await expect(
      captureServerException(new Error('boom'), { route: '/api/x' }),
    ).resolves.toBe(false)
    expect(mockCaptureException).not.toHaveBeenCalled()
  })
})
