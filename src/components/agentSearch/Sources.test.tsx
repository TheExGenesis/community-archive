import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { PortalTweet } from '@/lib/portal/types'
import { ResultList } from './ResultList'
import { Sources } from './Sources'
import { groupByPerson } from './TweetRows'

jest.mock('@/components/TweetCard', () => ({
  __esModule: true,
  default: ({ tweet }: { tweet: PortalTweet }) => (
    <article>Full card {tweet.id}</article>
  ),
}))
jest.mock('@/components/TweetAvatar', () => ({
  TweetAvatar: () => <span />,
}))

const tweet = (id: number, username = `user${id}`, month = 1): PortalTweet => ({
  id: String(id),
  username,
  name: username,
  avatar: null,
  text: `First line ${id}\nsecond line`,
  observedAt: '2025-01-01T00:00:00.000Z',
  createdAt: `2025-${String(month).padStart(2, '0')}-15T00:00:00.000Z`,
  likes: 0,
  rts: 0,
})

const many = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => tweet(from + i))

test('a row shows who, when and the first line, and opens in place', () => {
  render(
    <Sources
      title="Sources"
      relevant={[tweet(1)]}
      relevantNotShown={0}
      otherMatches={[]}
      citations={[]}
    />,
  )
  const row = screen.getByRole('button', { name: /@user1/ })
  expect(row).toHaveTextContent('Jan 2025')
  expect(row).toHaveTextContent('First line 1')
  expect(row).not.toHaveTextContent('second line')
  fireEvent.click(row)
  // The open card replaces the row rather than repeating it above the card.
  expect(screen.getByText('Full card 1')).toBeInTheDocument()
  expect(screen.queryByText('First line 1')).toBeNull()
  const close = screen.getByRole('button', { name: 'Collapse tweet by @user1' })
  expect(close).toHaveAttribute('aria-expanded', 'true')
  expect(close).toHaveFocus()
  fireEvent.click(close)
  expect(screen.getByRole('button', { name: /@user1/ })).toHaveFocus()
})

test('sources show 25 rows, then a row that opens more in place', () => {
  render(
    <Sources
      title="Sources"
      relevant={[]}
      relevantNotShown={0}
      otherMatches={many(80)}
      citations={[]}
    />,
  )
  const list = screen.getByRole('list', { name: 'Other matches' })
  expect(within(list).getAllByRole('button', { name: /@user/ })).toHaveLength(
    25,
  )
  fireEvent.click(within(list).getByRole('button', { name: '55 more' }))
  expect(within(list).getAllByRole('button', { name: /@user/ })).toHaveLength(
    75,
  )
  fireEvent.click(within(list).getByRole('button', { name: '5 more' }))
  expect(within(list).queryByRole('button', { name: /more$/ })).toBeNull()
})

test('tiers switch with pills, and relevant tweets not returned are counted', () => {
  render(
    <Sources
      title="Sources"
      relevant={many(2)}
      relevantNotShown={3}
      otherMatches={many(1, 10)}
      citations={[]}
    />,
  )
  const relevant = screen.getByRole('button', { name: 'Relevant (5)' })
  expect(relevant).toHaveAttribute('aria-pressed', 'true')
  expect(
    screen.getByText('3 more were judged relevant but not returned.'),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Other matches (1)' }))
  expect(screen.getByRole('button', { name: /@user10/ })).toBeInTheDocument()
})

test('the people view groups tweets by author with their counts', () => {
  const tweets = [
    tweet(1, 'alice', 1),
    tweet(2, 'bob', 2),
    tweet(3, 'alice', 6),
  ]
  expect(
    groupByPerson(tweets).map((p) => [p.username, p.tweets.length]),
  ).toEqual([
    ['alice', 2],
    ['bob', 1],
  ])
  render(
    <Sources
      title="Sources"
      relevant={tweets}
      relevantNotShown={0}
      otherMatches={[]}
      citations={[]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'People' }))
  const alice = screen.getByRole('button', { name: /@alice/ })
  expect(alice).toHaveTextContent('2 tweets')
  fireEvent.click(alice)
  expect(
    screen.getByRole('list', { name: 'Tweets by @alice' }),
  ).toBeInTheDocument()
})

test('nothing to show renders nothing', () => {
  const { container } = render(
    <Sources
      title="Sources"
      relevant={[]}
      relevantNotShown={0}
      otherMatches={[]}
      citations={[]}
    />,
  )
  expect(container).toBeEmptyDOMElement()
})

test('an answer list shows 8 rows, folds the rest, and marks cited tweets', () => {
  render(
    <ResultList
      label="Living there"
      tweets={many(12)}
      citations={new Map([['2', 4]])}
    />,
  )
  const section = screen.getByRole('region', { name: 'Living there' })
  expect(section).toHaveTextContent('Living there · 12 tweets')
  expect(
    within(section).getAllByRole('button', { name: /@user/ }),
  ).toHaveLength(8)
  expect(within(section).getByLabelText('Cited as 4')).toBeInTheDocument()
  fireEvent.click(
    within(section).getByRole('button', { name: '4 more in this list' }),
  )
  expect(
    within(section).getAllByRole('button', { name: /@user/ }),
  ).toHaveLength(12)
})
