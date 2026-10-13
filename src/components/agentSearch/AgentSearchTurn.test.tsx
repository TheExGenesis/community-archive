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

test("a live search shows the model's reasoning before the step it led to", () => {
  const messages: UIMessage[] = [
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'reasoning',
          text: 'The question names the archive. Search for it by name.',
        } as unknown as UIMessage['parts'][number],
        search('input-available'),
      ],
    },
  ]
  render(
    <AgentSearchTurn
      view={buildTurnView(messages, 0, { streaming: true })}
      active
      onStop={jest.fn()}
    />,
  )
  // Followed by a step, the reasoning has folded to its first sentence.
  expect(screen.getByLabelText('Search progress')).toHaveTextContent(
    'Thinking · The question names the archive.Searching “community archive”',
  )
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
    name: '1 step · 2 tweets in the answer',
  })
  // What was found but not used opens from its own count.
  expect(screen.getByRole('button', { name: /2 more found/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
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
  expect(within(sources).getAllByText(/1 tweet$/)).toHaveLength(2)
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

describe('a reopened conversation, its tweets still loading', () => {
  const ref = (id: string, p?: number) =>
    p === undefined ? { $t: id } : { $t: id, p }
  const stored: UIMessage[] = [
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-bash',
          toolCallId: 'c1',
          state: 'output-available',
          input: { command: 'search x' },
          output: {
            summary: 'Searched “x” · 5 tweets',
            exitCode: 0,
            files: { 'lists/all.jsonl': ['3', '4', '5'] },
            tweets: [
              ref('1'),
              ref('2'),
              ref('3', 0.9),
              ref('4', 0.5),
              ref('5'),
            ],
          },
        } as unknown as UIMessage['parts'][number],
        {
          type: 'text',
          text: 'Said [[t:1]] and [[t:2]] [[t:777]].\n[[t:2]]\n[[posts: All | lists/all.jsonl]]',
        },
      ],
    },
  ]
  const supply = (
    ids: string[],
    states: Record<string, 'failed' | 'unavailable'> = {},
  ) => ({
    tweets: new Map(ids.map((id) => [id, tweet(id)])),
    states: new Map(Object.entries(states)),
  })

  test('shows the answer at once with places held, not "unverified", then fills them in', () => {
    const { rerender } = render(
      <AgentSearchTurn
        view={buildTurnView(stored, 0, { supply: supply([]) })}
        active={false}
      />,
    )
    // The prose, the list heading with its full count, and the steps are
    // there before any tweet is.
    expect(screen.getByRole('region', { name: 'All' })).toHaveTextContent(
      'All · 3 tweets',
    )
    expect(
      screen.getByRole('button', { name: '1 step · 5 tweets in the answer' }),
    ).toBeInTheDocument()
    const cited = screen.getByRole('complementary', { name: 'Cited tweets' })
    expect(
      within(cited).getAllByRole('status', { name: 'Loading this tweet' }),
    ).toHaveLength(2)
    expect(within(cited).getByLabelText(/Citation 2/)).toBeInTheDocument()
    // The list holds its own three places; the turn's line counts the rest.
    expect(screen.getByText('Loading 2 tweets…')).toBeInTheDocument()
    expect(screen.getByText('Loading 3 tweets…')).toBeInTheDocument()
    // Only the id no search returned is unverified.
    expect(screen.getByText(/marked unverified/)).toHaveTextContent('777')
    expect(screen.queryByText(/no longer available/)).toBeNull()

    rerender(
      <AgentSearchTurn
        view={buildTurnView(stored, 0, {
          supply: supply(['1', '2', '3', '4', '5']),
        })}
        active={false}
      />,
    )
    expect(within(cited).queryByRole('status')).toBeNull()
    expect(cited).toHaveTextContent('Post 1')
    expect(cited).toHaveTextContent('Post 2')
    expect(screen.queryByText(/Loading/)).toBeNull()
    const list = screen.getByRole('region', { name: 'All' })
    expect(list).toHaveTextContent('All · 3 tweets')
    expect(within(list).getByText('Post 3')).toBeInTheDocument()
  })

  test('a tweet that could not be fetched offers Retry; a listed one that is gone says so', () => {
    const onRetryTweets = jest.fn()
    render(
      <AgentSearchTurn
        view={buildTurnView(stored, 0, {
          supply: supply(['3', '4'], {
            '1': 'failed',
            '2': 'failed',
            '5': 'unavailable',
          }),
        })}
        active={false}
        onRetryTweets={onRetryTweets}
      />,
    )
    const cited = screen.getByRole('complementary', { name: 'Cited tweets' })
    expect(within(cited).getAllByText('Couldn’t load this tweet')).toHaveLength(
      2,
    )
    fireEvent.click(within(cited).getAllByRole('button', { name: 'Retry' })[0])
    expect(onRetryTweets).toHaveBeenCalledTimes(1)
    // The gone listed tweet drops out of the list; the answer says so.
    const list = screen.getByRole('region', { name: 'All' })
    expect(list).toHaveTextContent('All · 2 tweets')
    expect(screen.getByText(/Couldn’t load 2 tweets/)).toBeInTheDocument()
    expect(
      screen.getByText(/One tweet in this answer is no longer available/),
    ).toBeInTheDocument()
    expect(screen.getByText(/marked unverified/)).toHaveTextContent('777')
  })

  test('when a tweet the prose cites is gone, the prose is withheld with Ask again; the list stays', () => {
    const onAskAgain = jest.fn()
    render(
      <AgentSearchTurn
        view={buildTurnView(stored, 0, {
          supply: supply(['1', '3', '4', '5'], { '2': 'unavailable' }),
        })}
        active={false}
        onAskAgain={onAskAgain}
      />,
    )
    expect(
      screen.getByText(/relied on tweets that are no longer available/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('complementary', { name: 'Cited tweets' }),
    ).toBeNull()
    expect(screen.queryByText(/marked unverified/)).toBeNull()
    expect(screen.getByRole('region', { name: 'All' })).toHaveTextContent(
      'All · 3 tweets',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }))
    expect(onAskAgain).toHaveBeenCalledTimes(1)
  })
})
