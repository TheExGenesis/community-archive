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

import { render, screen } from '@testing-library/react'
import type { PortalTweet } from '@/lib/portal/types'
import { TweetRow } from './TweetRow'
import { TweetLinksInNewTab } from './tweetLinks'

const tweet: PortalTweet = {
  id: '1',
  username: 'alice',
  name: 'Alice',
  avatar: null,
  text: 'hello',
  observedAt: '2025-01-01T00:00:00.000Z',
  createdAt: '2025-01-01T00:00:00.000Z',
  likes: 0,
  rts: 0,
}

test('cards open their links in place by default', () => {
  render(<TweetRow tweet={tweet} />)
  for (const link of screen.getAllByRole('link')) {
    expect(link).not.toHaveAttribute('target')
  }
})

test('inside TweetLinksInNewTab, every card link opens a new tab', () => {
  render(
    <TweetLinksInNewTab>
      <TweetRow tweet={tweet} showExternalLink />
    </TweetLinksInNewTab>,
  )
  const links = screen.getAllByRole('link')
  expect(links.length).toBeGreaterThan(1)
  for (const link of links) {
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  }
})
