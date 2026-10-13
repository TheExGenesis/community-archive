jest.mock('@/components/TweetCard', () => ({
  __esModule: true,
  default: ({ tweet }: { tweet: { text: string } }) => (
    <div>Full card: {tweet.text}</div>
  ),
}))
jest.mock('@/components/TweetAvatar', () => ({
  TweetAvatar: () => <span data-testid="avatar" />,
}))

import { fireEvent, render, screen, within } from '@testing-library/react'
import type { PortalTweet } from '@/lib/portal/types'
import { ResultList } from './ResultList'

const tweet = (id: string, username: string): PortalTweet => ({
  id,
  username,
  name: `${username} name`,
  avatar: null,
  text: `Tweet ${id} by ${username}`,
  observedAt: '2025-01-02T00:00:00.000Z',
  createdAt: '2025-01-01T00:00:00.000Z',
  likes: 0,
  rts: 0,
})

// Three by alice, then one by bob: alice has the most, so she leads.
const tweets = [
  tweet('1', 'bob'),
  tweet('2', 'alice'),
  tweet('3', 'alice'),
  tweet('4', 'alice'),
]
const noCitations = new Map<string, number>()

test('a tweets list can be regrouped by person, each showing their tweets', () => {
  render(
    <ResultList label="Living there" tweets={tweets} citations={noCitations} />,
  )
  const section = screen.getByRole('region', { name: 'Living there' })
  expect(section).toHaveTextContent('Living there · 4 tweets · 2 people')
  fireEvent.click(within(section).getByRole('button', { name: 'People' }))
  const people = within(section).getByRole('list', { name: 'Living there' })
  const [first, second] = within(people).getAllByText(/name$/)
  expect(first).toHaveTextContent('alice name')
  expect(second).toHaveTextContent('bob name')
  // Grouped from a tweets list, every tweet shows under its author.
  expect(within(people).getAllByText(/^Tweet \d by/)).toHaveLength(4)
})

test("the agent's people view shows as many of each person's tweets as it asked", () => {
  render(
    <ResultList
      label="Based there"
      tweets={tweets}
      citations={noCitations}
      view={{ kind: 'people', showcase: 1 }}
    />,
  )
  expect(screen.getByRole('button', { name: 'People' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // alice's first tweet, then a row that opens her other two; bob's one.
  expect(screen.getByText('Tweet 2 by alice')).toBeInTheDocument()
  expect(screen.queryByText('Tweet 3 by alice')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '2 more by @alice' }))
  expect(screen.getByText('Tweet 4 by alice')).toBeInTheDocument()
  expect(screen.getByText('Tweet 1 by bob')).toBeInTheDocument()
})

test('a plain people list folds every person behind their row', () => {
  render(
    <ResultList
      label="Who"
      tweets={tweets}
      citations={noCitations}
      view={{ kind: 'people', showcase: 0 }}
    />,
  )
  expect(screen.queryByText(/^Tweet \d by/)).toBeNull()
  const alice = screen.getByRole('button', { name: /alice name/ })
  expect(alice).toHaveTextContent('3 tweets')
  fireEvent.click(alice)
  expect(screen.getAllByText(/by alice$/)).toHaveLength(3)
})

test('a list with no label sits in the prose: no heading and no switch', () => {
  render(<ResultList label={null} tweets={tweets} citations={noCitations} />)
  expect(screen.queryByRole('region')).toBeNull()
  expect(screen.queryByRole('button', { name: 'People' })).toBeNull()
  expect(screen.getByRole('list', { name: 'Tweets' })).toBeInTheDocument()
})
