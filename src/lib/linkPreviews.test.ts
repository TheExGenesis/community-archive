import {
  UnsafePreviewUrlError,
  assertSafeRemoteUrl,
  fetchLinkPreviewMetadata,
  fetchSafeRemoteResource,
  fetchXArticleSyndicationMetadata,
  isPublicIpAddress,
  isXArticleUrl,
  normalizePreviewUrl,
  shouldRefreshCachedPreview,
  xArticleIdFromUrl,
  fetchXVideoSyndicationMetadata,
  resolveVideoPreviewUrl,
  previewCandidate,
  getTweetLinkPreviews,
  previewUrlHash,
} from './linkPreviews'

import { xVideoFromUrl } from './xVideoUrl'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { fetchSyndicatedTweet } from './twitterSyndication'

jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('./twitterSyndication', () => ({ fetchSyndicatedTweet: jest.fn() }))

const publicResolver = async () => [{ address: '1.1.1.1', family: 4 }]

describe('link preview safety and metadata', () => {
  test('normalizes public URLs and recognizes X Articles', () => {
    expect(normalizePreviewUrl('HTTPS://Example.COM:443/path#section')).toBe(
      'https://example.com/path',
    )
    expect(isXArticleUrl('https://x.com/i/article/123')).toBe(true)
    expect(isXArticleUrl('https://twitter.com/alice/article/123')).toBe(true)
    expect(isXArticleUrl('https://x.com/alice/status/123')).toBe(false)
    expect(xArticleIdFromUrl('https://x.com/i/article/123')).toBe('123')
    expect(xArticleIdFromUrl('https://x.com/i/article/not-a-number')).toBeNull()
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

  test('extracts an X Article preview from its parent tweet syndication data', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      article: {
        article_id: '2051411546757324800',
        title: 'Social traits &amp; wholesome online interactions',
        preview_text: 'A useful teaser from the article.',
        cover_media_url: 'https://pbs.twimg.com/media/cover.jpg',
      },
    })

    const metadata = await fetchXArticleSyndicationMetadata(
      'http://x.com/i/article/2051411546757324800',
      '2054372105223913761',
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledWith('2054372105223913761')
    expect(metadata).toEqual({
      canonicalUrl: 'https://x.com/i/article/2051411546757324800',
      title: 'Social traits & wholesome online interactions',
      description: 'A useful teaser from the article.',
      imageUrl: 'https://pbs.twimg.com/media/cover.jpg',
      siteName: 'X',
      contentType: 'application/json',
      isXArticle: true,
    })
  })

  test('rejects syndication metadata for a different X Article', async () => {
    await expect(
      fetchXArticleSyndicationMetadata(
        'https://x.com/i/article/123',
        '456',
        async () => ({
          article: {
            article_id: '999',
            title: 'Wrong article',
          },
        }),
      ),
    ).resolves.toBeNull()
  })

  test('refreshes legacy X Article fallbacks once without retrying new fallbacks immediately', () => {
    const now = Date.parse('2026-08-14T23:00:00.000Z')
    const url = 'http://x.com/i/article/2051411546757324800'

    expect(
      shouldRefreshCachedPreview(
        url,
        {
          title: 'X Article',
          image_url: null,
          expires_at: '2026-09-13T23:00:00.000Z',
        },
        now,
      ),
    ).toBe(true)
    expect(
      shouldRefreshCachedPreview(
        url,
        {
          title: 'X Article',
          image_url: null,
          expires_at: '2026-08-15T05:00:00.000Z',
        },
        now,
      ),
    ).toBe(false)
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

  test('cancels a streamed response that exceeds its byte limit', async () => {
    const cancel = jest.fn()
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1025))
        },
        cancel,
      }),
      { headers: { 'Content-Type': 'text/html' } },
    )
    await expect(
      fetchSafeRemoteResource(
        'https://example.com/stream',
        {
          accept: 'text/html',
          maximumBytes: 1024,
          allowedContentTypes: (type) => type === 'text/html',
        },
        jest.fn().mockResolvedValue(response),
        publicResolver,
      ),
    ).rejects.toThrow('too large')
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  test('aborts a request after the preview timeout', async () => {
    jest.useFakeTimers()
    try {
      const fetcher = jest.fn(
        (_url, options) =>
          new Promise<Response>((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () =>
              reject(new Error('Request aborted')),
            )
          }),
      ) as typeof fetch
      const request = fetchSafeRemoteResource(
        'https://example.com/slow',
        {
          accept: 'text/html',
          maximumBytes: 1024,
          allowedContentTypes: (type) => type === 'text/html',
        },
        fetcher,
        publicResolver,
      )
      const rejection = expect(request).rejects.toThrow('Request aborted')
      await jest.advanceTimersByTimeAsync(4000)
      await rejection
    } finally {
      jest.useRealTimers()
    }
  })
})

const videoUrl = 'https://x.com/therealbuni/status/1781147654623297657/video/1'
const poster =
  'https://pbs.twimg.com/ext_tw_video_thumb/1781147615410704385/pu/img/WbJTNBhnCVG_Hzln.jpg'

describe('linked X videos', () => {
  afterEach(() => jest.restoreAllMocks())

  test('allows explicit video permalinks while continuing to skip ordinary posts', () => {
    expect(previewCandidate(videoUrl)).toBe(videoUrl)
    expect(
      previewCandidate('https://twitter.com/alice/status/1781147654623297657'),
    ).toBeNull()
    expect(xVideoFromUrl(videoUrl)).toEqual({
      tweetId: '1781147654623297657',
      mediaIndex: 0,
    })
    expect(
      xVideoFromUrl(
        'https://twitter.com/i/web/status/1781147654623297657/video/2',
      ),
    ).toMatchObject({ mediaIndex: 1 })
    for (const url of [
      videoUrl.replace('x.com', 'x.com.evil.test'),
      videoUrl.replace('/video/1', '/video/0'),
      videoUrl + '/other',
      videoUrl.replace('https:', 'javascript:'),
    ]) {
      expect(xVideoFromUrl(url)).toBeNull()
    }
  })

  test('resolves the example shortened link without requesting its destination', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      new Response(null, {
        status: 301,
        headers: { location: videoUrl },
      }),
    )
    await expect(
      resolveVideoPreviewUrl('https://t.co/AXAuEVu3ch', fetcher),
    ).resolves.toBe(videoUrl)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith(
      'https://t.co/AXAuEVu3ch',
      expect.objectContaining({ redirect: 'manual' }),
    )
    fetcher.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private' },
      }),
    )
    await expect(
      resolveVideoPreviewUrl('https://t.co/unsafe', fetcher),
    ).resolves.toBe('https://t.co/unsafe')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  test('uses the requested video slot and never copies the external tweet text', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      tweet_id: '1781147654623297657',
      full_text: 'Do not archive this text',
      media: [
        { media_type: 'photo', media_url: 'https://pbs.twimg.com/photo.jpg' },
        { media_type: 'video', media_url: poster },
      ],
    })
    const metadata = await fetchXVideoSyndicationMetadata(
      videoUrl.replace('/video/1', '/video/2'),
      fetcher,
    )
    expect(fetcher).toHaveBeenCalledWith('1781147654623297657')
    expect(metadata).toMatchObject({ title: 'Video on X', imageUrl: poster })
    expect(JSON.stringify(metadata)).not.toContain('Do not archive')
    await expect(
      fetchXVideoSyndicationMetadata(videoUrl, fetcher),
    ).resolves.toBeNull()
    fetcher.mockResolvedValue({
      tweet_id: '99999',
      media: [{ media_type: 'video', media_url: poster }],
    })
    await expect(
      fetchXVideoSyndicationMetadata(videoUrl, fetcher),
    ).resolves.toBeNull()
    fetcher.mockResolvedValue(null)
    await expect(
      fetchXVideoSyndicationMetadata(videoUrl, fetcher),
    ).resolves.toBeNull()
  })

  test.each(['12345', '1781147654623297657'])(
    'resolves a text-only video link without duplicating the source tweet’s own media (%s)',
    async (sourceId) => {
      const shortUrl = 'https://t.co/AXAuEVu3ch'
      const readUrls = jest.fn().mockResolvedValue({ data: [], error: null })
      const readTweets = jest.fn().mockResolvedValue({
        data: [
          {
            tweet_id: sourceId,
            full_text: `Incredible things are happening in Spanish television ${shortUrl}`,
          },
        ],
      })
      const readCache = jest.fn().mockResolvedValue({ data: [], error: null })
      const upsert = jest.fn((row) => ({
        select: () => ({ single: async () => ({ data: row, error: null }) }),
      }))
      const from = jest.fn((table: string): unknown =>
        table === 'tweet_urls'
          ? { select: () => ({ in: readUrls }) }
          : table === 'tweets'
            ? { select: () => ({ in: readTweets }) }
            : { select: () => ({ in: readCache }), upsert },
      )
      jest
        .mocked(createServerServiceRoleClient)
        .mockReturnValue({ from } as never)
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          new Response(null, { status: 301, headers: { location: videoUrl } }),
        )
      jest.mocked(fetchSyndicatedTweet).mockResolvedValue({
        tweet_id: '1781147654623297657',
        media: [{ media_type: 'video', media_url: poster }],
      } as never)
      const previews = await getTweetLinkPreviews([sourceId])
      expect(readTweets).toHaveBeenCalledWith('tweet_id', [sourceId])
      if (sourceId === '1781147654623297657') {
        expect(previews.size).toBe(0)
        expect(upsert).not.toHaveBeenCalled()
        return
      }
      expect(previews.get(sourceId)).toEqual([
        expect.objectContaining({
          urlHash: previewUrlHash(shortUrl),
          canonicalUrl: videoUrl,
          imageUrl: poster,
          isVideo: true,
        }),
      ])
      expect(upsert).toHaveBeenCalledTimes(1)
    },
  )
})
