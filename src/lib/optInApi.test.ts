import { OptInApiError, updateOptIn } from './optInApi'

const mutation = {
  username: 'exampleuser',
  optedIn: true,
  termsVersion: 'v1.0',
}

describe('updateOptIn', () => {
  it('sends only the opt-in mutation fields', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(updateOptIn(mutation, fetchImpl)).resolves.toEqual({
      success: true,
    })
    expect(fetchImpl).toHaveBeenCalledWith('/api/opt-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutation),
    })
  })

  it('turns a rate limit response into retryable user-facing guidance', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
        },
      }),
    )

    await expect(updateOptIn(mutation, fetchImpl)).rejects.toMatchObject({
      name: 'OptInApiError',
      message: 'Too many requests. Please wait 1 minute and try again.',
      status: 429,
      retryAfterSeconds: 60,
    } satisfies Partial<OptInApiError>)
  })

  it('uses a stable fallback when an error response is not JSON', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response('upstream failure', { status: 502 }))

    await expect(updateOptIn(mutation, fetchImpl)).rejects.toThrow(
      'Failed to update opt-in status. Please try again.',
    )
  })
})
