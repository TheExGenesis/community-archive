jest.mock('server-only', () => ({}))

import { resolveProfileLinks } from './profileLinks'

describe('resolveProfileLinks', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  test('resolves unique t.co links and formats direct links without fetching them', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(null, {
        status: 301,
        headers: { location: 'https://www.community-archive.org/' },
      }),
    )

    await expect(
      resolveProfileLinks([
        'Bio https://t.co/abc and https://example.com/about/',
        'https://t.co/abc',
      ]),
    ).resolves.toEqual([
      {
        original_url: 'https://t.co/abc',
        expanded_url: 'https://www.community-archive.org/',
        display_url: 'community-archive.org',
      },
      {
        original_url: 'https://example.com/about/',
        expanded_url: 'https://example.com/about/',
        display_url: 'example.com/about',
      },
    ])
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  test('falls back to the short link when resolution fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network unavailable'))

    await expect(resolveProfileLinks(['https://t.co/abc'])).resolves.toEqual([
      {
        original_url: 'https://t.co/abc',
        expanded_url: 'https://t.co/abc',
        display_url: 't.co/abc',
      },
    ])
  })
})
