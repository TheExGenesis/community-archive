/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TweetRow } from '@/components/portal/TweetRow'
import type { PortalTweet } from '@/lib/portal/types'
import { capturePostHogEvent } from '@/lib/posthog'
;(globalThis as typeof globalThis & { React: typeof React }).React = React

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={String(src)} alt={alt} {...props} />
  ),
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: React.forwardRef<
    HTMLAnchorElement,
    React.AnchorHTMLAttributes<HTMLAnchorElement>
  >(function MockNextLink({ href, children, ...props }, ref) {
    return (
      <a ref={ref} href={String(href)} {...props}>
        {children}
      </a>
    )
  }),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/lib/posthog', () => ({
  capturePostHogEvent: jest.fn(),
}))
const mockCapturePostHogEvent = capturePostHogEvent as jest.Mock

const tweet: PortalTweet = {
  id: '42',
  username: 'archive_member',
  name: 'Archive Member',
  avatar: null,
  text: 'A quote with a picture',
  observedAt: '2026-08-07T20:00:00.000Z',
  createdAt: '2026-08-07T19:00:00.000Z',
  likes: 3,
  rts: 2,
  quoteCount: 12,
  media: [
    {
      url: 'https://pbs.twimg.com/media/main.jpg',
      type: 'photo',
      width: 1200,
      height: 800,
    },
  ],
  quotedTweet: {
    id: '99',
    username: 'quoted_member',
    name: 'Quoted Member',
    avatar: null,
    text: 'The quoted thought',
    createdAt: '2026-08-06T19:00:00.000Z',
    likes: 12,
    rts: 4,
    media: [
      {
        url: 'https://pbs.twimg.com/media/quoted.jpg',
        type: 'photo',
      },
    ],
  },
}

describe('portal TweetRow media', () => {
  beforeEach(() => {
    mockCapturePostHogEvent.mockReset()
  })

  test('uses a neutral card and explains its archived-quote evidence', async () => {
    const user = userEvent.setup()
    const { container } = render(<TweetRow tweet={tweet} featuredRank={1} />)
    const card = container.querySelector('article')

    expect(screen.queryByLabelText('Rank 1')).not.toBeInTheDocument()
    expect(card).toHaveClass('border-zinc-200/75')
    expect(card).toHaveClass(
      'duration-100',
      'hover:-translate-y-0.5',
      'hover:border-[#d4d4d7]/75',
    )
    expect(card?.className).not.toMatch(/amber|blue/)
    const archivedQuotes = screen.getByRole('link', {
      name: '12 archived quotes. Open tweet to see them.',
    })
    expect(archivedQuotes).toHaveClass('text-zinc-500')
    expect(archivedQuotes).not.toHaveClass('rounded-full', 'text-brand')

    await user.hover(archivedQuotes)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /Bangers uses this count for its Best ranking/i,
    )

    archivedQuotes.addEventListener('click', (event) => event.preventDefault())
    await user.click(archivedQuotes)
    expect(mockCapturePostHogEvent).toHaveBeenCalledWith('tweet_card_action', {
      action: 'open_archived_quotes',
      origin: 'unknown',
      has_media: true,
      has_quoted_tweet: true,
      is_featured: true,
    })
  })

  test('renders quotes and closes an enlarged image when the backdrop is clicked', async () => {
    render(<TweetRow tweet={tweet} />)

    expect(screen.getByText('The quoted thought')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Enlarge tweet image 1' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Enlarge quoted tweet image 1' }),
    ).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', { name: 'Enlarge tweet image 1' }),
    )
    expect(screen.getByRole('dialog')).toBeVisible()

    const overlay = document.querySelector<HTMLElement>(
      '[data-state="open"].fixed.inset-0',
    )
    expect(overlay).not.toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 0))
    fireEvent.pointerDown(overlay!, { button: 0, pointerType: 'mouse' })
    fireEvent.click(overlay!)

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })
})
