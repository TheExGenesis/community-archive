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

test('renders cited tweets, unverified note, other posts and coverage when done', () => {
  const messages: UIMessage[] = [
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        search('output-available', {
          tweets: [tweet('1'), tweet('2')],
          nextOffset: null,
        }),
        { type: 'text', text: 'People said things [[t:1]] [[t:777]]' },
      ],
    },
  ]
  render(<AgentSearchTurn view={buildTurnView(messages, 0)} active={false} />)

  const cited = screen.getByRole('region', { name: 'Cited tweets' })
  expect(cited).toHaveTextContent('Post 1')
  expect(document.getElementById('ask-a1-tweet-1')).toBeInTheDocument()
  expect(screen.getByText(/marked unverified/)).toHaveTextContent('777')

  const other = screen.getByText(/Other posts the search found \(1\)/)
  expect(screen.queryByText('Post 2')).not.toBeInTheDocument()
  fireEvent.click(other)
  const details = other.closest('details') as HTMLDetailsElement
  details.open = true
  fireEvent(details, new Event('toggle'))
  expect(screen.getByText('Post 2')).toBeInTheDocument()

  const coverage = screen.getByRole('region', { name: 'Coverage' })
  expect(coverage).toHaveTextContent('“community archive” · 2 tweets')
  expect(coverage).toHaveTextContent('Not searched: live X')
  expect(screen.getByText('1 research step')).toBeInTheDocument()
})
