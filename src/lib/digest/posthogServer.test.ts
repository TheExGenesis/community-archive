import { captureDigestPostHogEvent } from './posthogServer'

describe('digest PostHog server capture', () => {
  const originalToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  const originalHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

  afterEach(() => {
    if (originalToken === undefined)
      delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    else process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = originalToken
    if (originalHost === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_HOST
    else process.env.NEXT_PUBLIC_POSTHOG_HOST = originalHost
  })

  test('captures only aggregate page-creation properties', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com/'
    const fetcher = jest.fn().mockResolvedValue(new Response('{}'))

    await expect(
      captureDigestPostHogEvent(
        'admin-id',
        {
          event: 'digest_page_created',
          properties: {
            source: 'generated',
            status: 'draft',
            story_count: 5,
            editorial_warning_count: 1,
          },
        },
        fetcher,
      ),
    ).resolves.toBe(true)

    expect(fetcher.mock.calls[0][0]).toBe('https://us.i.posthog.com/capture/')
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(body).toEqual({
      api_key: 'phc_test',
      event: 'digest_page_created',
      properties: {
        distinct_id: 'admin-id',
        $geoip_disable: true,
        source: 'generated',
        status: 'draft',
        story_count: 5,
        editorial_warning_count: 1,
      },
    })
  })
})
