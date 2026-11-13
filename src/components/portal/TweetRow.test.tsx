jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/components/TweetLikeButton', () => ({
  TweetLikeButton: () => null,
}))
jest.mock('@/components/TweetLinkPreviews', () => ({
  TweetLinkPreviews: () => null,
}))
jest.mock('./AddToProfileButton', () => ({ AddToProfileButton: () => null }))
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))

import { fireEvent, render, screen } from '@testing-library/react'
import type { PortalTweet } from '@/lib/portal/types'
import { TweetRow } from './TweetRow'

const tweet = (text: string): PortalTweet => ({
  id: '1',
  username: 'alice',
  name: 'Alice',
  avatar: null,
  text,
  observedAt: '2025-01-01T00:00:00.000Z',
  createdAt: '2025-01-01T00:00:00.000Z',
  likes: 0,
  rts: 0,
})

test('a compact collapsible card offers Read more for text past two lines', () => {
  render(<TweetRow tweet={tweet('word '.repeat(40))} compact collapsible />)
  const more = screen.getByRole('button', { name: 'Read more' })
  fireEvent.click(more)
  expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
})

test('short compact text, or a compact card without collapsible, has no Read more', () => {
  const { rerender } = render(
    <TweetRow tweet={tweet('short one')} compact collapsible />,
  )
  expect(screen.queryByRole('button', { name: 'Read more' })).toBeNull()
  rerender(<TweetRow tweet={tweet('word '.repeat(40))} compact />)
  expect(screen.queryByRole('button', { name: 'Read more' })).toBeNull()
})

// X allows up to 20 photos per tweet since 2026-11; rows show four tiles.
const photos = (count: number, prefix = 'p') =>
  Array.from({ length: count }, (_, n) => ({
    url: `https://pbs.twimg.com/media/${prefix}${n + 1}.jpg`,
    type: 'photo',
    width: 1200,
    height: 800,
  }))

test.each([true, false])(
  'a 13-photo tweet shows four tiles, a +9 overlay and a 13-image gallery (compact=%s)',
  (compact) => {
    render(
      <TweetRow
        tweet={{ ...tweet('many photos'), media: photos(13) }}
        compact={compact}
      />,
    )
    const tiles = screen.getAllByRole('button', {
      name: /^Enlarge tweet image/,
    })
    expect(tiles).toHaveLength(4)
    expect(screen.getByTestId('media-overflow')).toHaveTextContent('+9')
    expect(tiles[3]).toHaveAccessibleName(
      'Enlarge tweet image 4, 9 more images',
    )

    fireEvent.click(tiles[3])
    expect(screen.getByText('Image 4 of 13')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next image' }))
    expect(screen.getByText('Image 5 of 13')).toBeInTheDocument()
  },
)

test('quoted-tweet media caps at four tiles with the full gallery behind them', () => {
  render(
    <TweetRow
      tweet={{
        ...tweet('quoting'),
        media: [],
        quotedTweet: {
          id: '2',
          username: 'bob',
          name: 'Bob',
          avatar: null,
          text: 'quoted',
          createdAt: '2025-01-01T00:00:00.000Z',
          likes: 0,
          rts: 0,
          media: photos(6, 'q'),
        },
      }}
    />,
  )
  const tiles = screen.getAllByRole('button', {
    name: /^Enlarge quoted tweet image/,
  })
  expect(tiles).toHaveLength(4)
  expect(screen.getByTestId('media-overflow')).toHaveTextContent('+2')
  fireEvent.click(tiles[0])
  expect(screen.getByText('Image 1 of 6')).toBeInTheDocument()
})

test('four or fewer photos get no overlay', () => {
  render(<TweetRow tweet={{ ...tweet('four'), media: photos(4) }} compact />)
  expect(
    screen.getAllByRole('button', { name: /^Enlarge tweet image/ }),
  ).toHaveLength(4)
  expect(screen.queryByTestId('media-overflow')).toBeNull()
})
