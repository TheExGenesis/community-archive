import { act, render, screen } from '@testing-library/react'
import type { ImgHTMLAttributes } from 'react'
import { TweetLinkPreviews } from './TweetLinkPreviews'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt = '',
    fill: _fill,
    unoptimized,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean
    unoptimized?: boolean
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} data-unoptimized={String(unoptimized)} />
  ),
}))

afterEach(() => {
  jest.restoreAllMocks()
})

test('loads Article covers directly from the authenticated image proxy', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        previews: [
          {
            urlHash: 'a'.repeat(64),
            url: 'https://x.com/i/article/123',
            canonicalUrl: 'https://x.com/i/article/123',
            title: 'Social traits for wholesome online interactions',
            description: 'A useful teaser.',
            imageUrl: 'https://pbs.twimg.com/media/article.jpg',
            siteName: 'X',
            isXArticle: true,
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  )

  const { container } = render(<TweetLinkPreviews tweetId="42" />)

  expect(
    await screen.findByText('Social traits for wholesome online interactions'),
  ).toBeVisible()
  const image = container.querySelector('img')
  expect(image).toHaveAttribute(
    'src',
    `/api/link-preview/image?hash=${'a'.repeat(64)}`,
  )
  expect(image).toHaveAttribute('data-unoptimized', 'true')
})

test('waits for the viewport and shares concurrent requests for the same tweet', async () => {
  const callbacks: IntersectionObserverCallback[] = []
  const OriginalObserver = global.IntersectionObserver
  global.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      callbacks.push(callback)
    }
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver
  let finish!: (value: Response) => void
  const fetchMock = jest.spyOn(global, 'fetch').mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  try {
    render(
      <>
        <TweetLinkPreviews tweetId="88" />
        <TweetLinkPreviews tweetId="88" />
      </>,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    act(() =>
      callbacks.forEach((callback) =>
        callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        ),
      ),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish(new Response(JSON.stringify({ previews: [] })))
      await Promise.resolve()
    })
  } finally {
    global.IntersectionObserver = OriginalObserver
  }
})

test('shows a linked video poster with a play indicator and opens X', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        previews: [
          {
            urlHash: 'b'.repeat(64),
            canonicalUrl:
              'https://x.com/therealbuni/status/1781147654623297657/video/1',
            title: 'Video on X',
            description: 'Watch this video on X.',
            imageUrl: 'https://pbs.twimg.com/poster.jpg',
            siteName: 'X',
            isXArticle: false,
            isVideo: true,
          },
        ],
      }),
    ),
  )
  const { container } = render(<TweetLinkPreviews tweetId="12345" />)
  const link = await screen.findByRole('link', { name: /Video on X/ })
  expect(link).toHaveAttribute(
    'href',
    'https://x.com/therealbuni/status/1781147654623297657/video/1',
  )
  expect(link).toHaveAttribute('target', '_blank')
  expect(container.querySelector('img')).toHaveAttribute(
    'src',
    `/api/link-preview/image?hash=${'b'.repeat(64)}`,
  )
  expect(container.querySelector('.aspect-video')).toBeInTheDocument()
  expect(link.querySelector('svg')).toBeInTheDocument()
})
