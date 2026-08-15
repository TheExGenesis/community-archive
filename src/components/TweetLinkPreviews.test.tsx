import { render, screen } from '@testing-library/react'
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
