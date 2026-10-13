import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { UIMessage } from 'ai'
import type { PortalTweet } from '@/lib/portal/types'
import { AgentSearchTurn } from './AgentSearchTurn'
import { buildTurnView } from './messageView'

jest.mock('@/components/TweetCard', () => ({
  __esModule: true,
  default: ({ tweet }: { tweet: PortalTweet }) => (
    <article>{tweet.text}</article>
  ),
}))
jest.mock('@/components/TweetAvatar', () => ({
  TweetAvatar: () => <span />,
}))
// react-markdown is ESM-only; the answer text itself is covered in messageView.
jest.mock('./AnswerMarkdown', () => ({
  AnswerMarkdown: ({ children }: { children: string }) => <div>{children}</div>,
}))

// jsdom does not lay out, so it has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn()
})

const tweet = (id: string, username = `user${id}`) => ({
  id,
  username,
  name: `User ${id}`,
  avatar: null,
  text: `Post ${id}`,
  observedAt: '2025-01-01T00:00:00.000Z',
  createdAt: '2025-01-01T00:00:00.000Z',
  likes: 0,
  rts: 0,
  replyToTweetId: null,
  replyToUsername: null,
  quoteTweetId: null,
})

const search = (state: string, output?: unknown, id = 'c1') =>
  ({
    type: 'tool-search_tweets',
    toolCallId: id,
    state,
    input: { query: 'community archive' },
    ...(output ? { output } : {}),
    ...(state === 'output-error' ? { errorText: 'down' } : {}),
  }) as unknown as UIMessage['parts'][number]

const found = {
  tweets: [
    tweet('1'),
    { ...tweet('2', 'shared'), p: 0.8 },
    tweet('3', 'shared'),
    tweet('4'),
  ],
  nextOffset: null,
}

test('shows the live steps with Stop while the agent searches', () => {
  const onStop = jest.fn()
  const messages: UIMessage[] = [
    { id: 'a1', role: 'assistant', parts: [search('input-available')] },
  ]
  render(
    <AgentSearchTurn
      view={buildTurnView(messages, 0, { streaming: true })}
      active
      onStop={onStop}
    />,
  )
  expect(screen.getByLabelText('Search progress')).toHaveTextContent(
    'Searching “community archive”',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  expect(onStop).toHaveBeenCalled()
  expect(screen.queryByRole('region', { name: 'Sources' })).toBeNull()
})

test('folds the steps into one line once the answer is being written', () => {
  const messages: UIMessage[] = [
    {
      id: 'a1',
      role: 'assistant',
      parts: [search('output-available', found), { type: 'text', text: 'So' }],
    },
  ]
  render(
    <AgentSearchTurn
      view={buildTurnView(messages, 0, { streaming: true })}
      active
      onStop={() => undefined}
    />,
  )
  expect(
    screen.getByRole('button', { name: '1 step · writing the answer' }),
  ).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
})

test('renders the answer with its list, the cited rail and the sources', () => {
  const messages: UIMessage[] = [
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        search('output-available', found),
        {
          type: 'text',
          text: 'People said things [[t:1]] [[t:777]]\n[[posts: Shared | 1, 2]]',
        },
      ],
    },
  ]
  render(<AgentSearchTurn view={buildTurnView(messages, 0)} active={false} />)

  // The folded log line opens in place to the steps and what was not searched.
  const line = screen.getByRole('button', {
    name: '1 step · 2 in the answer · 2 more found',
  })
  fireEvent.click(line)
  expect(line).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText(/Searched “community archive”/)).toBeInTheDocument()
  expect(screen.getByText(/Not searched: live X/)).toBeInTheDocument()

  const cited = screen.getByRole('complementary', { name: 'Cited tweets' })
  expect(cited).toHaveTextContent('Post 1')
  expect(screen.getByText(/marked unverified/)).toHaveTextContent('777')

  // The agent's list, with the cited tweet carrying its number.
  const list = screen.getByRole('region', { name: 'Shared' })
  expect(list).toHaveTextContent('Shared · 2 tweets')
  expect(within(list).getByLabelText('Cited as 1')).toBeInTheDocument()

  // Sources hold only what the answer neither cites nor lists.
  const sources = screen.getByRole('region', { name: 'Sources' })
  expect(
    within(sources).getByRole('button', { name: 'Other matches (2)' }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(within(sources).getByText('@shared')).toBeInTheDocument()
  expect(within(sources).getByText('@user4')).toBeInTheDocument()
  fireEvent.click(within(sources).getByRole('button', { name: 'People' }))
  expect(within(sources).getAllByText(/1 tweet · Jan 2025/)).toHaveLength(2)
})

test('a stopped turn keeps its steps and found tweets, and asks again', () => {
  const onAskAgain = jest.fn()
  const messages: UIMessage[] = [
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        search('output-available', found),
        search('input-available', undefined, 'c2'),
      ],
    },
  ]
  render(
    <AgentSearchTurn
      view={buildTurnView(messages, 0)}
      active={false}
      interrupted={{ kind: 'stopped', elapsedMs: 105_000 }}
      onAskAgain={onAskAgain}
    />,
  )
  expect(screen.getByText('You stopped this at 1:45')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ask again' }))
  expect(onAskAgain).toHaveBeenCalled()
  expect(
    screen.getByRole('region', { name: 'Found before you stopped' }),
  ).toBeInTheDocument()
})

test('a run whose searches all failed says the archive is not responding', () => {
  const messages: UIMessage[] = [
    { id: 'a1', role: 'assistant', parts: [search('output-error')] },
  ]
  render(
    <AgentSearchTurn
      view={buildTurnView(messages, 0)}
      active={false}
      onAskAgain={() => undefined}
      canAskAgain={false}
    />,
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Archive search isn’t responding',
  )
  expect(
    screen.getByText('This question still counts toward today’s limit.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ask again' })).toBeDisabled()
  expect(screen.getByText('No questions left today')).toBeInTheDocument()
})

test('says a follow-up with no new searches used the earlier tweets', () => {
  const messages: UIMessage[] = [
    {
      id: 'a2',
      role: 'assistant',
      parts: [{ type: 'text', text: 'From before.' }],
    },
  ]
  render(<AgentSearchTurn view={buildTurnView(messages, 0)} active={false} />)
  expect(
    screen.getByRole('button', {
      name: 'No new searches, used the earlier tweets',
    }),
  ).toBeInTheDocument()
})
