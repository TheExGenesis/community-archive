import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
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
// react-markdown is ESM-only; the answer text itself is covered in messageView.
jest.mock('./AnswerMarkdown', () => ({
  AnswerMarkdown: ({ children }: { children: string }) => <div>{children}</div>,
}))

// jsdom does not lay out, so it has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn()
})

const tweet = (id: string) => ({
  id,
  username: `user${id}`,
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

const search = (state: string, output?: unknown) =>
  ({
    type: 'tool-search_tweets',
    toolCallId: 'c1',
    state,
    input: { query: 'community archive' },
    ...(output ? { output } : {}),
  }) as unknown as UIMessage['parts'][number]

test('shows live progress while the agent is still searching', () => {
  const messages: UIMessage[] = [
    { id: 'a1', role: 'assistant', parts: [search('input-available')] },
  ]
  render(
    <AgentSearchTurn
      view={buildTurnView(messages, 0, { streaming: true })}
      active
    />,
  )
  expect(screen.getByLabelText('Search progress')).toHaveAttribute(
    'aria-live',
    'polite',
  )
  expect(screen.getByText('Searching “community archive”')).toBeInTheDocument()
  expect(screen.queryByText('Coverage')).not.toBeInTheDocument()
})

test('renders the receipt, cited tweets, unverified note, evidence tabs and coverage when done', () => {
  const messages: UIMessage[] = [
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        search('output-available', {
          tweets: [tweet('1'), { ...tweet('2'), p: 0.8 }, tweet('3')],
          nextOffset: null,
        }),
        { type: 'text', text: 'People said things [[t:1]] [[t:777]]' },
      ],
    },
  ]
  render(<AgentSearchTurn view={buildTurnView(messages, 0)} active={false} />)

  expect(screen.getByRole('button', { name: 'Based on 1 cited post' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '1 more judged relevant' })).toBeInTheDocument()

  const cited = screen.getByRole('complementary', { name: 'Cited tweets' })
  expect(cited).toHaveTextContent('Post 1')
  expect(document.getElementById('ask-a1-tweet-1')).toBeInTheDocument()
  expect(screen.getByText(/marked unverified/)).toHaveTextContent('777')

  // Relevant posts show by default; other matches mount when their tab opens.
  expect(screen.getByRole('tab', { name: 'Also relevant (1)' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(screen.getByText('Post 2')).toBeInTheDocument()
  expect(screen.queryByText('Post 3')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '1 other match' }))
  expect(screen.getByText('Post 3')).toBeInTheDocument()

  const coverage = screen.getByRole('region', { name: 'Coverage' })
  expect(coverage).toHaveTextContent('“community archive” · 3 tweets')
  expect(coverage).toHaveTextContent('Not searched: live X')
  expect(screen.getByText('1 research step')).toBeInTheDocument()
})
