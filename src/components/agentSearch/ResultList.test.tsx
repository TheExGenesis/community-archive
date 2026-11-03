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

test('a reopened people list opens as people once its tweets land, and keeps the reader’s switch', () => {
  const list = (
    shown: PortalTweet[],
    pending: Array<{ id: string; state: 'loading' }>,
  ) => (
    <ResultList
      label="Who"
      tweets={shown}
      citations={noCitations}
      view={{ kind: 'people', showcase: 0 }}
      pending={pending}
    />
  )
  // The list mounts with its tweets still loading, then they arrive.
  const { rerender } = render(
    list(
      [],
      [
        { id: '1', state: 'loading' },
        { id: '2', state: 'loading' },
      ],
    ),
  )
  rerender(list([tweet('1', 'bob'), tweet('2', 'alice')], []))
  expect(screen.getByRole('button', { name: 'People' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Tweets' }))
  rerender(list(tweets, []))
  expect(screen.getByRole('button', { name: 'Tweets' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a list with no label sits in the prose: no heading and no switch', () => {
  render(<ResultList label={null} tweets={tweets} citations={noCitations} />)
  expect(screen.queryByRole('region')).toBeNull()
  expect(screen.queryByRole('button', { name: 'People' })).toBeNull()
  expect(screen.getByRole('list', { name: 'Tweets' })).toBeInTheDocument()
})

test('a list sorts by relevance by default and can sort by date', async () => {
  const scored = [tweet('1', 'bob'), tweet('2', 'alice')]
  scored[0].createdAt = '2025-03-01T00:00:00.000Z'
  render(
    <ResultList
      label="Scored"
      tweets={scored}
      citations={noCitations}
      scores={
        new Map([
          ['2', 0.9],
          ['1', 0.3],
        ])
      }
    />,
  )
  const rows = () =>
    screen.getAllByText(/^Tweet \d by/).map((el) => el.textContent)
  const trigger = () => screen.getByRole('button', { name: /^Sort:/ })
  expect(trigger()).toHaveAccessibleName('Sort: relevance, descending')
  expect(rows()).toEqual(['Tweet 2 by alice', 'Tweet 1 by bob'])
  // Radix opens its menu from the keyboard in jsdom.
  const open = () => fireEvent.keyDown(trigger(), { key: 'Enter' })
  open()
  expect(
    screen.queryByRole('menuitemradio', { name: 'Most tweets' }),
  ).toBeNull()
  fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Date' }))
  expect(rows()).toEqual(['Tweet 1 by bob', 'Tweet 2 by alice'])
  // Most tweets is offered once the list is grouped by person.
  fireEvent.click(screen.getByRole('button', { name: 'People' }))
  open()
  expect(
    await screen.findByRole('menuitemradio', { name: 'Most tweets' }),
  ).toBeInTheDocument()
})
