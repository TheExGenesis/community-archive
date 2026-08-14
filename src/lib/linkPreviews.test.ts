import {
  UnsafePreviewUrlError,
  assertSafeRemoteUrl,
  fetchLinkPreviewMetadata,
  fetchSafeRemoteResource,
  isPublicIpAddress,
  isXArticleUrl,
  normalizePreviewUrl,
} from './linkPreviews'

const publicResolver = async () => [{ address: '1.1.1.1', family: 4 }]

describe('link preview safety and metadata', () => {
  test('normalizes public URLs and recognizes X Articles', () => {
    expect(normalizePreviewUrl('HTTPS://Example.COM:443/path#section')).toBe(
      'https://example.com/path',
    )
    expect(isXArticleUrl('https://x.com/i/article/123')).toBe(true)
    expect(isXArticleUrl('https://twitter.com/alice/article/123')).toBe(true)
    expect(isXArticleUrl('https://x.com/alice/status/123')).toBe(false)
  })

  test('rejects literal and resolved private destinations', async () => {
    expect(isPublicIpAddress('127.0.0.1')).toBe(false)
    expect(isPublicIpAddress('10.0.0.2')).toBe(false)
    expect(isPublicIpAddress('::ffff:7f00:1')).toBe(false)
    expect(isPublicIpAddress('::ffff:172.16.0.1')).toBe(false)
    expect(isPublicIpAddress('::127.0.0.1')).toBe(false)
    expect(isPublicIpAddress('64:ff9b::7f00:1')).toBe(false)
    expect(isPublicIpAddress('2002:7f00:1::')).toBe(false)
    expect(isPublicIpAddress('fe80::1')).toBe(false)
    expect(isPublicIpAddress('1.1.1.1')).toBe(true)
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true)

    await expect(
      assertSafeRemoteUrl('http://127.0.0.1/test'),
    ).rejects.toBeInstanceOf(UnsafePreviewUrlError)
    await expect(
      assertSafeRemoteUrl('https://example.com/test', async () => [
        { address: '192.168.1.2', family: 4 },
      ]),
    ).rejects.toBeInstanceOf(UnsafePreviewUrlError)
  })

  test('revalidates every redirect before issuing the next request', async () => {
    const fetcher = jest.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'http://127.0.0.1/private' },
        }),
    ) as unknown as typeof fetch

    await expect(
      fetchSafeRemoteResource(
        'https://example.com/start',
        {
          accept: 'text/html',
          maximumBytes: 1024,
          allowedContentTypes: (type) => type === 'text/html',
        },
        fetcher,
        publicResolver,
      ),
    ).rejects.toBeInstanceOf(UnsafePreviewUrlError)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('extracts normalized X Article metadata from bounded HTML', async () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="A durable article &amp; its title">
      <meta property="og:description" content="A useful description">
      <meta property="og:site_name" content="X">
      <meta property="og:image" content="/article.jpg">
      <link rel="canonical" href="https://x.com/i/article/123">
    </head></html>`
    const fetcher = jest.fn(
      async () =>
        new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    ) as unknown as typeof fetch

    const metadata = await fetchLinkPreviewMetadata(
      'https://x.com/i/article/123',
      fetcher,
      publicResolver,
    )

    expect(metadata).toMatchObject({
      canonicalUrl: 'https://x.com/i/article/123',
      title: 'A durable article & its title',
      description: 'A useful description',
      imageUrl: 'https://x.com/article.jpg',
      siteName: 'X',
      isXArticle: true,
    })
  })

  test('rejects oversized responses before reading the body', async () => {
    const fetcher = jest.fn(
      async () =>
        new Response('small', {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Content-Length': '2048',
          },
        }),
    ) as unknown as typeof fetch

    await expect(
      fetchSafeRemoteResource(
        'https://example.com/large',
        {
          accept: 'text/html',
          maximumBytes: 1024,
          allowedContentTypes: (type) => type === 'text/html',
        },
        fetcher,
        publicResolver,
      ),
    ).rejects.toThrow('too large')
  })
})
