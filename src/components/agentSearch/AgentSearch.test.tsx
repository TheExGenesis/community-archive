import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { UIMessage } from 'ai'

const mockChat: {
  messages: UIMessage[]
  status: 'ready' | 'submitted' | 'streaming' | 'error'
} = { messages: [], status: 'ready' }

jest.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: mockChat.messages,
    status: mockChat.status,
    error: undefined,
    setMessages: jest.fn(),
    sendMessage: jest.fn(),
    resumeStream: jest.fn(),
    clearError: jest.fn(),
    stop: jest.fn(),
  }),
}))
jest.mock('@ai-sdk/workflow/client', () => ({
  WorkflowChatTransport: class {},
}))
jest.mock('./AnswerMarkdown', () => ({
  AnswerMarkdown: ({ children }: { children: string }) => <div>{children}</div>,
}))

import AgentSearch, { EXAMPLE_QUESTIONS } from './AgentSearch'

const quota = (remaining: number) => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      conversations: [],
      dailyLimit: 10,
      remainingToday: remaining,
      resetsAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
    }),
  })) as unknown as typeof fetch
}

const thread: UIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Who?' }] },
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Them.' }] },
]

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn()
  // jsdom's crypto has no randomUUID.
  let n = 0
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => `conversation-${++n}`,
  })
})

beforeEach(() => {
  mockChat.messages = []
  mockChat.status = 'ready'
})

test('a first visit is the heading and a composer that carries the facts', async () => {
  quota(10)
  render(<AgentSearch />)
  expect(
    screen.getByRole('heading', { level: 1, name: 'Ask the archive' }),
  ).toBeInTheDocument()
  const box = screen.getByLabelText('Your question')
  expect(box).toHaveAttribute('placeholder', 'Ask about members’ tweets')
  expect(screen.getByText('Private to you')).toBeInTheDocument()
  expect(screen.getByText('Every claim cited')).toBeInTheDocument()
  expect(await screen.findByText('10 left today')).toBeInTheDocument()
  expect(screen.queryByText(/Answers are private/)).toBeNull()
  expect(screen.queryByText(/Shift\+Enter/)).toBeNull()
  // An example fills the box rather than sending.
  fireEvent.click(screen.getByRole('button', { name: EXAMPLE_QUESTIONS[0] }))
  expect(box).toHaveValue(EXAMPLE_QUESTIONS[0])
})

test('in a thread the composer is one line, with the count only when few remain', async () => {
  mockChat.messages = thread
  quota(7)
  const { unmount } = render(<AgentSearch />)
  expect(screen.getByLabelText('Ask a follow-up')).toBeInTheDocument()
  await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  expect(screen.queryByText(/left today/)).toBeNull()
  unmount()

  quota(2)
  render(<AgentSearch />)
  expect(await screen.findByText('2 left today')).toBeInTheDocument()
})

test('with no questions left the composer becomes a sentence with the reset time', async () => {
  mockChat.messages = thread
  quota(0)
  render(<AgentSearch />)
  expect(
    await screen.findByText(
      /You’ve used today’s 10 questions. You can ask again at/,
    ),
  ).toBeInTheDocument()
  expect(screen.queryByLabelText('Ask a follow-up')).toBeNull()
})

test('while a question runs there is no composer, only Stop in the log', () => {
  mockChat.messages = [thread[0]]
  mockChat.status = 'submitted'
  quota(5)
  render(<AgentSearch />)
  expect(screen.queryByLabelText('Ask a follow-up')).toBeNull()
  expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
  expect(screen.getByLabelText('Search progress')).toHaveTextContent(
    'Reading the question',
  )
})
