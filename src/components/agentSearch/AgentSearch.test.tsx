import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { UIMessage } from 'ai'

const mockChat: {
  messages: UIMessage[]
  status: 'ready' | 'submitted' | 'streaming' | 'error'
  resumeStream: jest.Mock
  sendMessage: jest.Mock
  setMessages: jest.Mock
} = {
  messages: [],
  status: 'ready',
  resumeStream: jest.fn(),
  sendMessage: jest.fn(),
  setMessages: jest.fn(),
}
const mockTransport: {
  options?: {
    onChatSendMessage: (response: Response, info: { chatId: string }) => void
  }
} = {}

jest.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: mockChat.messages,
    status: mockChat.status,
    error: undefined,
    setMessages: mockChat.setMessages,
    sendMessage: mockChat.sendMessage,
    resumeStream: mockChat.resumeStream,
    clearError: jest.fn(),
    stop: jest.fn(),
  }),
}))
jest.mock('@ai-sdk/workflow/client', () => ({
  WorkflowChatTransport: class {
    constructor(options: typeof mockTransport.options) {
      mockTransport.options = options
    }
  },
}))
jest.mock('./AnswerMarkdown', () => ({
  AnswerMarkdown: ({ children }: { children: string }) => <div>{children}</div>,
}))

import AgentSearch, { EXAMPLE_QUESTIONS } from './AgentSearch'
import { writeOwnKey } from './ownKeyStore'

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

/** The id the page gave its conversation, as the server echoes it. */
let lastConversationId = ''

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
    value: () => (lastConversationId = `conversation-${++n}`),
  })
})

beforeEach(() => {
  mockChat.messages = []
  mockChat.status = 'ready'
  mockChat.resumeStream = jest.fn()
  mockChat.sendMessage = jest.fn()
  mockChat.setMessages = jest.fn()
})

test('a first visit is the heading and a composer that carries the facts', async () => {
  quota(10)
  render(<AgentSearch />)
  expect(
    screen.getByRole('heading', { level: 1, name: 'Ask the archive' }),
  ).toBeInTheDocument()
  const box = screen.getByLabelText('Your question')
  expect(box).toHaveAttribute('placeholder', 'Ask about members’ tweets')
  // The facts sit under the box, not inside it.
  const composer = box.closest('.rounded-xl') as HTMLElement
  expect(screen.getByText('Private to you')).toBeInTheDocument()
  expect(screen.getByText('Answers cite tweets')).toBeInTheDocument()
  expect(composer).not.toHaveTextContent('Private to you')
  expect(composer).not.toHaveTextContent('Answers cite tweets')
  expect(await screen.findByText('10 left today')).toBeInTheDocument()
  expect(screen.queryByText(/Answers are private/)).toBeNull()
  expect(screen.queryByText(/Shift\+Enter/)).toBeNull()
  // An example fills the box rather than sending.
  fireEvent.click(screen.getByRole('button', { name: EXAMPLE_QUESTIONS[0] }))
  expect(box).toHaveValue(EXAMPLE_QUESTIONS[0])
})

test('beside the facts, a disclosure says where questions go and what deletion keeps', async () => {
  quota(10)
  render(<AgentSearch />)
  fireEvent.click(
    screen.getByRole('button', { name: 'How questions are handled' }),
  )
  expect(await screen.findByText(/through OpenRouter/)).toBeInTheDocument()
  expect(screen.getByText(/expire within about 7 days/)).toBeInTheDocument()
})

test('paused, the composer gives way to a plain line and nothing can be asked', async () => {
  quota(10)
  render(<AgentSearch paused />)
  expect(screen.getByText(/Ask the archive is paused/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Your question')).toBeNull()
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

test('when the month runs out before the day, the page counts the month', async () => {
  const month = (remaining: number) => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        conversations: [],
        dailyLimit: 10,
        remainingToday: 8,
        resetsAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
        monthlyLimit: 30,
        remainingThisMonth: remaining,
        monthResetsAt: new Date(Date.now() + 9 * 86_400_000).toISOString(),
      }),
    })) as unknown as typeof fetch
  }
  mockChat.messages = thread
  month(2)
  const { unmount } = render(<AgentSearch />)
  expect(await screen.findByText('2 left this month')).toBeInTheDocument()
  unmount()

  month(0)
  render(<AgentSearch />)
  expect(
    await screen.findByText(
      /You’ve used this month’s 30 questions. You can ask again on/,
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

describe('the conversation in the URL', () => {
  const runningConversation = () => {
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes('/conversations/')
          ? {
              messages: [
                { id: 'asr_1-question', role: 'user', parts: [] },
              ] as UIMessage[],
              runningRunId: 'asr_1',
            }
          : { conversations: [] },
    })) as unknown as typeof fetch
  }
  const conversationLoads = () =>
    (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
      String(url).includes('/conversations/'),
    ).length

  test('a conversation opened from the list gets its own history entry, so Back returns to the list', async () => {
    window.history.replaceState(null, '', '/search/ask')
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes('/conversations/')
          ? { messages: thread, runningRunId: null }
          : {
              conversations: [
                {
                  id: 'c1',
                  title: 'Who tweets about Singapore?',
                  startedAt: '2026-10-09T10:00:00.000Z',
                  updatedAt: '2026-10-09T10:00:00.000Z',
                  turns: 1,
                  status: 'completed',
                },
              ],
              dailyLimit: 10,
              remainingToday: 9,
            },
    })) as unknown as typeof fetch
    render(<AgentSearch />)
    const entries = window.history.length
    fireEvent.click(await screen.findByText('Who tweets about Singapore?'))
    await waitFor(() => expect(window.location.search).toBe('?c=c1'))
    expect(window.history.length).toBe(entries + 1)

    window.history.back()
    await waitFor(() => expect(window.location.search).toBe(''))
    await waitFor(() =>
      expect(mockChat.setMessages).toHaveBeenLastCalledWith([]),
    )
  })

  test('opening a running conversation resumes it once, even when the page renders again', async () => {
    runningConversation()
    const { rerender } = render(
      <AgentSearch initialConversationId="conversation-open" />,
    )
    await waitFor(() => expect(mockChat.resumeStream).toHaveBeenCalledTimes(1))
    rerender(<AgentSearch initialConversationId="conversation-open" />)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(conversationLoads()).toBe(1)
    expect(mockChat.resumeStream).toHaveBeenCalledTimes(1)
  })

  // Sending puts the id in the URL; a server render of the page (Fast
  // Refresh, a router refresh) then passed it back, the page reopened the
  // conversation and resumed the run beside the stream it was reading, and
  // the two streams pushed copies of the answer.
  test('the conversation being asked in is not reopened when its id comes back from the URL', async () => {
    runningConversation()
    const { rerender } = render(<AgentSearch />)
    const chatId = 'conversation-asked'
    mockTransport.options?.onChatSendMessage(
      new Response(null, { headers: { 'x-workflow-run-id': 'asr_1' } }),
      { chatId },
    )
    rerender(<AgentSearch initialConversationId={chatId} />)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(conversationLoads()).toBe(0)
    expect(mockChat.resumeStream).not.toHaveBeenCalled()
  })
})

describe('an answer whose stream ended early', () => {
  // The answer streams, the server names its run, then the stream ends.
  const streamThenEnd = (stored: unknown) => {
    mockChat.messages = thread
    mockChat.status = 'streaming'
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('/conversations/') ? stored : { conversations: [] },
    })) as unknown as typeof fetch
    const { rerender } = render(<AgentSearch />)
    mockTransport.options?.onChatSendMessage(
      new Response(null, { headers: { 'x-workflow-run-id': 'asr_1' } }),
      { chatId: lastConversationId },
    )
    mockChat.status = 'ready'
    rerender(<AgentSearch />)
  }

  test('reads on when the server says its run is still going, and passes reconnect settings to the transport', async () => {
    streamThenEnd({ messages: [thread[0]], runningRunId: 'asr_1' })
    await waitFor(() => expect(mockChat.resumeStream).toHaveBeenCalledTimes(1))
    const options = mockTransport.options as unknown as {
      maxConsecutiveErrors: number
      fetch: unknown
    }
    expect(options.maxConsecutiveErrors).toBeGreaterThan(3)
    expect(typeof options.fetch).toBe('function')
  })

  test('leaves a finished answer alone when the server has the same one', async () => {
    streamThenEnd({
      messages: [
        thread[0],
        { ...thread[1], id: 'asr_1', metadata: { outcome: 'done' } },
      ],
      runningRunId: null,
    })
    await waitFor(() =>
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) =>
          String(url).includes('/conversations/'),
        ),
      ).toBe(true),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockChat.resumeStream).not.toHaveBeenCalled()
    expect(mockChat.setMessages).not.toHaveBeenCalled()
  })
})

describe('the member’s own OpenRouter key', () => {
  const KEY = `sk-or-v1-${'f6'.repeat(32)}`
  const quotaWithKeys = () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        conversations: [],
        dailyLimit: 10,
        remainingToday: 0,
        ownKeyEnabled: true,
        ownKeyDailyLimit: 100,
        ownKeyRemainingToday: 90,
        resetsAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
      }),
    })) as unknown as typeof fetch
  }
  const prepare = () =>
    (
      mockTransport.options as unknown as {
        prepareSendMessagesRequest: (input: {
          id: string
          messages: UIMessage[]
        }) => { body: unknown; headers?: Record<string, string> }
      }
    ).prepareSendMessagesRequest({
      id: 'conv-1234',
      messages: [
        { id: 'u', role: 'user', parts: [{ type: 'text', text: 'Who?' }] },
      ],
    })

  afterEach(() => writeOwnKey(null))

  test('out of house questions, the page offers the key', async () => {
    quotaWithKeys()
    render(<AgentSearch />)
    expect(
      await screen.findByRole('button', {
        name: 'Use your own OpenRouter key',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/to ask up to 100 a day/)).toBeInTheDocument()
    // Without a key, nothing extra goes with a question.
    expect(prepare().headers).toBeUndefined()
  })

  test('with a key, questions carry it and the count is the key’s', async () => {
    writeOwnKey(KEY)
    quotaWithKeys()
    render(<AgentSearch />)
    expect(
      await screen.findByRole('button', { name: /90 left today/ }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('On your key')).toBeInTheDocument()
    expect(prepare()).toEqual({
      body: { id: 'conv-1234', question: 'Who?' },
      headers: { 'x-openrouter-key': KEY },
    })
  })
})

describe('a search handed over from archive search', () => {
  test('prefills the box and the filters as chips, and sends nothing until asked', async () => {
    quota(10)
    window.history.replaceState(
      null,
      '',
      '/search/ask?q=singapore&fromUser=visakanv&sinceDate=2025-01-01',
    )
    render(
      <AgentSearch
        initialPrefill={{
          text: 'singapore',
          filters: [
            { key: 'from', value: 'visakanv' },
            { key: 'since', value: '2025-01-01' },
          ],
        }}
      />,
    )
    const box = screen.getByLabelText('Your question')
    expect(box).toHaveValue('singapore')
    expect(screen.getByText('From @visakanv')).toBeInTheDocument()
    expect(mockChat.sendMessage).not.toHaveBeenCalled()
    // The address forgets the search, so a reload starts fresh.
    expect(window.location.search).toBe('')
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Since 1 Jan 2025' }),
    )
    await screen.findByText('10 left today')
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(mockChat.sendMessage).toHaveBeenCalledWith({
      text: 'singapore (from @visakanv)',
    })
    expect(screen.queryByText('From @visakanv')).toBeNull()
  })
})

test('arrival fetches the list once, with placeholders until it lands', async () => {
  let release: () => void = () => {}
  const fetchMock = jest.fn(
    (_url: string) =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            ok: true,
            json: async () => ({
              conversations: [],
              dailyLimit: 10,
              remainingToday: 9,
              resetsAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
            }),
          })
      }),
  )
  global.fetch = fetchMock as unknown as typeof fetch
  render(<AgentSearch />)
  expect(
    screen.getByRole('status', { name: 'Loading your past questions' }),
  ).toBeInTheDocument()
  expect(screen.queryByText(/left today/)).toBeNull()
  release()
  expect(await screen.findByText('9 left today')).toBeInTheDocument()
  expect(
    screen.queryByRole('status', { name: 'Loading your past questions' }),
  ).toBeNull()
  expect(
    fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/agent-search/conversations'),
    ),
  ).toHaveLength(1)
})

describe('opening a stored conversation', () => {
  test('shows it as soon as the messages arrive and fetches its tweets after, cited first', async () => {
    let releaseTweets: () => void = () => {}
    const tweetRequests: string[][] = []
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/tweets')) {
        const { ids } = JSON.parse(String(init?.body)) as { ids: string[] }
        tweetRequests.push(ids)
        await new Promise<void>((resolve) => {
          releaseTweets = resolve
        })
        return {
          ok: true,
          json: async () => ({
            tweets: ids.map((id) => ({
              id,
              text: `Post ${id}`,
              username: 'u',
            })),
            failed: [],
          }),
        }
      }
      if (String(url).includes('/conversations/')) {
        return {
          ok: true,
          json: async () => ({
            messages: [
              {
                id: 'r1-question',
                role: 'user',
                parts: [{ type: 'text', text: 'Who?' }],
              },
              {
                id: 'r1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'Them [[t:1]].' }],
              },
            ] as UIMessage[],
            runningRunId: null,
            tweets: [],
            pendingTweetIds: Array.from({ length: 40 }, (_, i) =>
              String(i + 1),
            ),
            unavailableTweetIds: [],
          }),
        }
      }
      return { ok: true, json: async () => ({ conversations: [] }) }
    }) as unknown as typeof fetch
    render(<AgentSearch initialConversationId="conversation-stored" />)
    expect(
      screen.getByRole('status', { name: 'Opening the conversation' }),
    ).toBeInTheDocument()
    // The skeleton goes as soon as the messages are in, while the tweets
    // are still being fetched.
    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'Opening the conversation' }),
      ).toBeNull(),
    )
    await waitFor(() => expect(tweetRequests.length).toBeGreaterThan(0))
    // A small first batch (the cited tweets), larger ones after it.
    expect(tweetRequests[0]).toEqual(
      Array.from({ length: 30 }, (_, i) => String(i + 1)),
    )
    releaseTweets()
    await waitFor(() => expect(tweetRequests).toHaveLength(2))
    expect(tweetRequests[1]).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i + 31)),
    )
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/agent-search/conversations/conversation-stored/tweets',
      expect.objectContaining({ method: 'POST', cache: 'no-store' }),
    )
  })
})
