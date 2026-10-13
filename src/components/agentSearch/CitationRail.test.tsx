jest.mock('@/components/TweetCard', () => ({
  __esModule: true,
  default: ({ tweet }: { tweet: { text: string } }) => <div>{tweet.text}</div>,
}))

import { render, screen, within } from '@testing-library/react'
import type { PortalTweet } from '@/lib/portal/types'
import { CitationRail } from './CitationRail'
import type { FoundPhase, FoundTweet } from './messageView'

const tweet = (id: string): PortalTweet => ({
  id,
  username: `user${id}`,
  name: `User ${id}`,
  avatar: null,
  text: `Tweet ${id}`,
  observedAt: '2025-01-01T00:00:00.000Z',
  createdAt: '2025-01-01T00:00:00.000Z',
  likes: 0,
  rts: 0,
})
const item = (id: string, score?: number): FoundTweet => ({
  tweet: tweet(id),
  score,
})

function rail(found: FoundTweet[], phase: FoundPhase, count: number) {
  return (
    <CitationRail
      citations={[]}
      active
      found={found}
      foundPhase={phase}
      foundCount={count}
    />
  )
}

const shown = () =>
  within(screen.getByRole('complementary'))
    .getAllByText(/^Tweet \d$/)
    .map((el) => el.textContent)

test('names the phase and keeps tweets on screen in place as new ones arrive', () => {
  const latest: FoundPhase = { kind: 'latest', source: 'Searched “singapore”' }
  const { rerender } = render(rail([item('1'), item('2')], latest, 300))
  expect(
    screen.getByRole('complementary', { name: 'Latest matches' }),
  ).toHaveTextContent('300 found · newest from searched “singapore”')
  expect(shown()).toEqual(['Tweet 1', 'Tweet 2'])

  // A new set: the newcomer enters at the top, tweet 2 moves down instead of
  // leaving, and the newcomer is highlighted.
  rerender(rail([item('3'), item('1')], latest, 600))
  expect(shown()).toEqual(['Tweet 3', 'Tweet 1', 'Tweet 2'])
  expect(screen.getByText('Tweet 3').closest('li')).toHaveClass('bg-brand/10')

  // Once the relevance check has run the column starts over, with scores.
  rerender(
    rail(
      [item('7', 0.92), item('3', 0.6)],
      { kind: 'relevant', relevant: 41 },
      600,
    ),
  )
  expect(
    screen.getByRole('complementary', { name: 'Most relevant so far' }),
  ).toHaveTextContent('600 found · 41 judged relevant')
  expect(shown()).toEqual(['Tweet 7', 'Tweet 3'])
  expect(screen.getByText('0.92')).toBeInTheDocument()
})

test('shows at most five', () => {
  const many = ['1', '2', '3', '4', '5', '6'].map((id) => item(id))
  render(rail(many, { kind: 'latest', source: null }, 6))
  expect(shown()).toHaveLength(5)
})
