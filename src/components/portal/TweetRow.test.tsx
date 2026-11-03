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
