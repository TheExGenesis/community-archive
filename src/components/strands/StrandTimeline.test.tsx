import { fireEvent, render, screen } from '@testing-library/react'
import StrandTimeline from './StrandTimeline'
import type { PortalTweet } from '@/lib/portal/types'
jest.mock('@/components/TweetCard', () => ({
  __esModule: true,
  default: ({ tweet }: { tweet: PortalTweet }) => (
    <article>{tweet.text}</article>
  ),
}))
jest.mock('@/components/portal/TweetRow', () => ({ TweetAvatar: () => null }))
beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => {}))
})
const tweet = (id: string, createdAt: string): PortalTweet => ({
  id,
  createdAt,
  observedAt: createdAt,
  username: 'author',
  name: 'Author',
  text: `Post ${id}`,
  avatar: null,
  likes: 0,
  rts: 0,
})
test('map keyboard selection and chronological list retain all source posts', () => {
  render(
    <StrandTimeline
      seedId="1"
      posts={[
        {
          id: '2',
          annotation: 'Echo: later thought',
          tweet: tweet('2', '2023-01-01'),
        },
        {
          id: '1',
          annotation: 'Origin: initial thought',
          tweet: tweet('1', '2020-01-01'),
        },
      ]}
    />,
  )
  expect(screen.getByText('Post 1')).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('button', { name: /2. @author/ }), {
    key: 'Enter',
  })
  expect(screen.getByText('Post 2')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'timeline' }))
  expect(screen.getByText('Jan 1, 2020 · Seed post')).toBeInTheDocument()
  expect(screen.getByText('Jan 1, 2023')).toBeInTheDocument()
  expect(screen.queryByText('Key post')).not.toBeInTheDocument()
  expect(screen.getAllByRole('article').map((el) => el.textContent)).toEqual([
    'Post 1',
    'Post 2',
  ])
})
test('map uses individual posts while the timeline groups by month, preserving every post', () => {
  const { container } = render(
    <StrandTimeline
      seedId="1"
      posts={[
        { id: '1', annotation: 'First', tweet: tweet('1', '2020-01-01') },
        { id: '2', annotation: 'Second', tweet: tweet('2', '2020-01-30') },
        { id: '3', annotation: 'Third', tweet: tweet('3', '2020-02-01') },
      ]}
    />,
  )
  expect(container.querySelectorAll('[data-post-dot]')).toHaveLength(3)
  const dots = container.querySelectorAll('[data-post-dot]')
  expect(Number(dots[0].getAttribute('cx'))).toBeLessThan(
    Number(dots[1].getAttribute('cx')),
  )
  fireEvent.keyDown(screen.getByRole('button', { name: /2. @author/ }), {
    key: 'Enter',
  })
  expect(screen.getByText('Post 2')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'timeline' }))
  expect(container.querySelectorAll('[data-timeline-month]')).toHaveLength(2)
  expect(screen.getAllByRole('article').map((el) => el.textContent)).toEqual([
    'Post 1',
    'Post 2',
    'Post 3',
  ])
})
