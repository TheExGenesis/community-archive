// The page with the real chat hook and Workflow transport, fed synthetic
// responses: what a member sees when streams break, runs end on the server,
// Stop fails, or conversations load out of order. AgentSearch.test.tsx mocks
// the hook and covers the composer and the quota.
import { TextDecoderStream, TextEncoderStream } from 'node:stream/web'
Object.assign(globalThis, { TextDecoderStream, TextEncoderStream })
import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { UIMessage } from 'ai'
import type { TurnInterruption } from './AgentSearchTurn'
import type { TurnView } from './messageView'

jest.mock('./AgentSearchTurn', () => ({
  AgentSearchTurn: ({
    view,
    interrupted,
    active,
    onStop,
    stopState,
  }: {
    view: TurnView
    interrupted?: TurnInterruption | null
    active: boolean
    onStop?: () => void
    stopState?: string | null
  }) => (
    <div data-testid="turn">
      {view.answer.checking ? '[checking]' : view.answer.markdown}|
      {interrupted?.kind ?? view.outcome}|
      {active ? <button onClick={onStop}>Stop</button> : 'idle'}
      {stopState && `|${stopState}`}
    </div>
  ),
}))
jest.mock('./StepLog', () => ({
  StepLog: ({
    mode,
    onStop,
    stopState,
  }: {
    mode: string
    onStop?: () => void
    stopState?: string | null
  }) => (
    <div data-testid="log">
      {mode}
      {stopState && `|${stopState}`}
      {onStop && <button onClick={onStop}>Stop</button>}
    </div>
  ),
}))
jest.mock('./QuestionsLeft', () => ({ QuestionsLeft: () => null }))
jest.mock('./QuestionHandling', () => ({ QuestionHandling: () => null }))
jest.mock('./OwnKeyControl', () => ({ ownKeyRefusalMessage: () => null }))
jest.mock('./ConversationHistory', () => ({
  GHOST_BUTTON: '',
  ConversationHistory: () => null,
}))
jest.mock('./RecentConversations', () => ({ RecentConversations: () => null }))
jest.mock('@/components/portal/tweetLinks', () => ({
  TweetLinksInNewTab: ({ children }: { children: React.ReactNode }) => children,
}))

import AgentSearch from './AgentSearch'

/** Lets timers, fetches and the chat's throttled updates run. */
const tick = (ms = 80) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const question = (id = 'q', text = 'Question'): UIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
})
const answer = (id = 'a', text = 'Complete answer'): UIMessage => ({
  id,
  role: 'assistant',
  parts: [{ type: 'text', text }],
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** A run's stream as the start route sends it, pushed chunk by chunk. */
function sse(runId = 'asr_1') {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel() {},
  })
  return {
    response: new Response(stream, {
      headers: { 'x-workflow-run-id': runId },
    }),
    push: (chunk: unknown) =>
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`),
      ),
    close: () => controller.close(),
  }
}

let fetchMock: jest.Mock
const url = (input: unknown) =>
  typeof input === 'string' ? input : (input as { url: string }).url
/** What every test answers when it has nothing to say. */
function defaultFetch(input: unknown) {
  if (url(input).endsWith('/conversations')) return json({ conversations: [] })
  throw new Error(`Unexpected request ${url(input)}`)
}

beforeAll(() => {
  let n = 0
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => `conversation-${++n}`,
  })
  Element.prototype.scrollIntoView = jest.fn()
})
beforeEach(() => {
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
  window.history.replaceState(null, '', '/')
})
afterEach(() => cleanup())

async function ask(text = 'Question') {
  const box = screen.getByLabelText('Your question')
  fireEvent.change(box, { target: { value: text } })
  fireEvent.submit(box.closest('form')!)
  await tick()
}

/** A run's stream, broken after 'Partial' was written. */
async function streamBreaks(stream: ReturnType<typeof sse>) {
  stream.push({ type: 'start' })
  stream.push({ type: 'text-start', id: 't' })
  stream.push({ type: 'text-delta', id: 't', delta: 'Partial' })
  await tick()
  stream.push({ type: 'error', errorText: 'The stream broke' })
  await tick(150)
}

describe('an answer whose stream ended', () => {
  test('a broken stream is settled with the stored answer, held until its cited tweets are checked', async () => {
    const stream = sse('asr_1')
    const tweets = deferred<Response>()
    // The run finished on the server meanwhile, citing tweet 1.
    const stored = {
      messages: [
        question('asr_1-question'),
        {
          id: 'asr_1',
          role: 'assistant',
          metadata: { outcome: 'done' },
          parts: [
            {
              type: 'tool-bash',
              toolCallId: 'c1',
              state: 'output-available',
              input: { command: 'search x' },
              output: { summary: 'Searched', tweets: [{ $t: '1' }] },
            },
            { type: 'text', text: 'Complete answer [[t:1]]' },
          ],
        },
      ],
      runningRunId: null,
      pendingTweetIds: ['1'],
    }
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      if (init?.method === 'POST' && url(input).endsWith('/tweets')) {
        return tweets.promise
      }
      if (init?.method === 'POST') return stream.response
      if (url(input).includes('/conversations/')) return json(stored)
      return defaultFetch(input)
    })
    render(<AgentSearch />)
    await ask()
    await streamBreaks(stream)
    await tick()
    // The stored answer is in, its prose held until tweet 1 is confirmed.
    expect(screen.getByTestId('turn')).toHaveTextContent('[checking]|done|idle')
    expect(screen.queryByRole('alert')).toBeNull()
    tweets.resolve(
      json({
        tweets: [
          {
            id: '1',
            username: 'someone',
            name: 'Someone',
            text: 'Tweet 1',
            avatar: null,
            observedAt: '2025-01-01T00:00:00Z',
            createdAt: '2025-01-01T00:00:00Z',
            likes: 0,
            rts: 0,
          },
        ],
        failed: [],
      }),
    )
    await tick()
    expect(screen.getByTestId('turn')).toHaveTextContent(
      'Complete answer [1](#ask-asr_1-tweet-1)|done|idle',
    )
  })

  test('a stored answer citing a tweet that is gone is withheld, as a reopened one is', async () => {
    const stream = sse('asr_1')
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      if (init?.method === 'POST' && url(input).endsWith('/tweets')) {
        return json({ tweets: [], failed: [] })
      }
      if (init?.method === 'POST') return stream.response
      if (url(input).includes('/conversations/')) {
        return json({
          messages: [
            question('asr_1-question'),
            {
              id: 'asr_1',
              role: 'assistant',
              metadata: { outcome: 'done' },
              parts: [
                {
                  type: 'tool-bash',
                  toolCallId: 'c1',
                  state: 'output-available',
                  input: { command: 'search x' },
                  output: { summary: 'Searched', tweets: [{ $t: '1' }] },
                },
                { type: 'text', text: 'Names someone [[t:1]]' },
              ],
            },
          ],
          runningRunId: null,
          pendingTweetIds: ['1'],
        })
      }
      return defaultFetch(input)
    })
    render(<AgentSearch />)
    await ask()
    await streamBreaks(stream)
    await tick()
    expect(screen.getByTestId('turn')).toHaveTextContent('|done|idle')
    expect(screen.getByTestId('turn')).not.toHaveTextContent('Names someone')
  })

  test('a stream that ended as finished is settled when the run failed, and left alone when the stored answer is the same', async () => {
    const finish = (stream: ReturnType<typeof sse>) => {
      stream.push({ type: 'start' })
      stream.push({ type: 'text-start', id: 't' })
      stream.push({ type: 'text-delta', id: 't', delta: 'Partial' })
      stream.push({ type: 'text-end', id: 't' })
      stream.push({ type: 'finish' })
      stream.close()
    }
    // The model hit its length limit: the run is stored as failed.
    const failed = sse('asr_1')
    let loads = 0
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') return failed.response
      if (url(input).includes('/conversations/')) {
        loads++
        return json({
          messages: [
            question('asr_1-question'),
            {
              id: 'asr_1',
              role: 'assistant',
              metadata: { outcome: 'failed' },
              parts: [
                { type: 'text', text: 'Partial' },
                {
                  type: 'text',
                  text: '\n\n_This answer failed before it finished._',
                },
              ],
            },
          ],
          runningRunId: null,
        })
      }
      return defaultFetch(input)
    })
    const page = render(<AgentSearch />)
    await ask()
    finish(failed)
    await tick(150)
    expect(screen.getByTestId('turn')).toHaveTextContent('Partial|failed|idle')
    expect(loads).toBe(1)
    page.unmount()

    // The same answer finished and stored: the one streamed stays.
    const done = sse('asr_2')
    let tweetLoads = 0
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      if (init?.method === 'POST' && url(input).endsWith('/tweets')) {
        tweetLoads++
        return json({ tweets: [], failed: [] })
      }
      if (init?.method === 'POST') return done.response
      if (url(input).includes('/conversations/')) {
        return json({
          messages: [
            question('asr_2-question'),
            {
              id: 'asr_2',
              role: 'assistant',
              metadata: { outcome: 'done' },
              parts: [{ type: 'text', text: 'Partial' }],
            },
          ],
          runningRunId: null,
          pendingTweetIds: ['9'],
        })
      }
      return defaultFetch(input)
    })
    render(<AgentSearch />)
    await ask()
    finish(done)
    await tick(150)
    expect(screen.getByTestId('turn')).toHaveTextContent('Partial|done|idle')
    expect(tweetLoads).toBe(0)
  })

  test('a replay that never connects leaves the partial answer and its question in place', async () => {
    const stream = sse('asr_1')
    let replays = 0
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') return stream.response
      if (url(input).includes('/stream?')) {
        replays++
        return json({ error: 'unavailable' }, 401)
      }
      if (url(input).includes('/conversations/')) {
        return json({ messages: [question()], runningRunId: 'asr_1' })
      }
      return defaultFetch(input)
    })
    render(<AgentSearch />)
    await ask()
    await streamBreaks(stream)
    await tick(100)
    expect(replays).toBe(1)
    expect(screen.getByTestId('turn')).toHaveTextContent('Partial|failed|idle')
    expect(
      screen.getByRole('heading', { name: 'Question' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Ask a follow-up')).toHaveValue('')
  })

  test('a replay takes the partial answer’s place once its stream connects', async () => {
    const stream = sse('asr_1')
    const replay = sse('asr_1')
    let settled = 0
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') return stream.response
      if (url(input).includes('/stream?')) return replay.response
      if (url(input).includes('/conversations/')) {
        // Still going when the first stream broke; stored once the replay
        // has finished, as the page then checks again.
        return ++settled === 1
          ? json({ messages: [question()], runningRunId: 'asr_1' })
          : json({
              messages: [
                question('asr_1-question'),
                {
                  ...answer('asr_1', 'Partial, then all'),
                  metadata: { outcome: 'done' },
                },
              ],
              runningRunId: null,
            })
      }
      return defaultFetch(input)
    })
    render(<AgentSearch />)
    await ask()
    await streamBreaks(stream)
    replay.push({ type: 'start' })
    replay.push({ type: 'text-start', id: 't' })
    replay.push({ type: 'text-delta', id: 't', delta: 'Partial, then all' })
    await tick()
    expect(screen.getAllByTestId('turn')).toHaveLength(1)
    expect(screen.getByTestId('turn')).toHaveTextContent(
      'Partial, then all|done|',
    )
    replay.push({ type: 'text-end', id: 't' })
    replay.push({ type: 'finish' })
    replay.close()
    await tick(150)
    expect(screen.getByTestId('turn')).toHaveTextContent(
      'Partial, then all|done|idle',
    )
  })

  test('an accepted question stays when the reconnect to its answer is refused', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      if (url(input).includes('/conversations/')) {
        return json({ messages: [question()], runningRunId: 'asr_1' })
      }
      if (url(input).includes('/stream?')) {
        return json({ error: 'unavailable' }, 401)
      }
      return defaultFetch(input)
    })
    render(<AgentSearch initialConversationId="A" />)
    await tick(250)
    expect(
      screen.getByRole('heading', { name: 'Question' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('log')).toHaveTextContent('failed')
    expect(screen.getByLabelText('Ask a follow-up')).toHaveValue('')
  })

  test('a failed partial answer stays failed after a follow-up', async () => {
    const first = sse('asr_1')
    const second = sse('asr_2')
    let posts = 0
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return ++posts === 1 ? first.response : second.response
      }
      if (url(input).includes('/conversations/')) {
        return json({ messages: [question()], runningRunId: null })
      }
      return defaultFetch(input)
    })
    render(<AgentSearch />)
    await ask()
    await streamBreaks(first)
    expect(screen.getByTestId('turn')).toHaveTextContent('Partial|failed|idle')
    const box = screen.getByLabelText('Ask a follow-up')
    fireEvent.change(box, { target: { value: 'Next' } })
    fireEvent.submit(box.closest('form')!)
    await tick()
    expect(screen.getByTestId('turn')).toHaveTextContent('Partial|failed|idle')
  })
})

describe('Stop', () => {
  test('shows as stopping until the server confirms, then the answer is stopped and not picked up again', async () => {
    const stream = sse('asr_1')
    const cancel = deferred<Response>()
    let settles = 0
    let reconnects = 0
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      if (url(input).endsWith('/cancel')) return cancel.promise
      if (init?.method === 'POST') return stream.response
      if (url(input).includes('/stream?')) {
        reconnects++
        return stream.response
      }
      if (url(input).includes('/conversations/')) {
        settles++
        return json({ messages: [question()], runningRunId: 'asr_1' })
      }
      return defaultFetch(input)
    })
    render(<AgentSearch />)
    await ask()
    stream.push({ type: 'start' })
    stream.push({ type: 'text-start', id: 't' })
    stream.push({ type: 'text-delta', id: 't', delta: 'Partial' })
    await tick()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await tick()
    // Still reading while the server has not answered.
    expect(screen.getByTestId('turn')).toHaveTextContent(
      'Partial|done|Stop|pending',
    )
    stream.push({ type: 'text-delta', id: 't', delta: ' more' })
    await tick()
    expect(screen.getByTestId('turn')).toHaveTextContent(
      'Partial more|done|Stop|pending',
    )
    cancel.resolve(json({ status: 'failed' }))
    await tick(150)
    expect(screen.getByTestId('turn')).toHaveTextContent(
      'Partial more|stopped|idle',
    )
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(settles).toBe(0)
    expect(reconnects).toBe(0)
  })

  test('a cancel the server refuses says so and keeps Stop, while the answer goes on', async () => {
    const stream = sse('asr_1')
    const cancels: number[] = []
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      if (url(input).endsWith('/cancel')) {
        cancels.push(cancels.length)
        return cancels.length === 1
          ? json({ error: 'unavailable' }, 503)
          : json({ status: 'failed' })
      }
      if (init?.method === 'POST') return stream.response
      return defaultFetch(input)
    })
    render(<AgentSearch />)
    await ask()
    stream.push({ type: 'start' })
    stream.push({ type: 'text-start', id: 't' })
    stream.push({ type: 'text-delta', id: 't', delta: 'Partial' })
    await tick()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await tick(100)
    expect(cancels).toHaveLength(1)
    expect(screen.getByTestId('turn')).toHaveTextContent(
      'Partial|done|Stop|failed',
    )
    stream.push({ type: 'text-delta', id: 't', delta: ' goes on' })
    await tick()
    expect(screen.getByTestId('turn')).toHaveTextContent(
      'Partial goes on|done|Stop|failed',
    )
    // Pressed again, the cancel goes through.
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await tick(150)
    expect(cancels).toHaveLength(2)
    expect(screen.getByTestId('turn')).toHaveTextContent(
      'Partial goes on|stopped|idle',
    )
  })

  test('pressed on a new question after a run whose stream broke, Stop waits for the new run and cancels that one', async () => {
    const first = sse('asr_1')
    const second = sse('asr_2')
    const headers = deferred<Response>()
    let posts = 0
    let secondSignal: AbortSignal | undefined
    const cancelled: string[] = []
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      if (url(input).endsWith('/cancel')) {
        cancelled.push(url(input))
        return json({ status: 'failed' })
      }
      if (init?.method === 'POST') {
        if (++posts === 1) return first.response
        secondSignal = init.signal ?? undefined
        return headers.promise
      }
      if (url(input).includes('/conversations/')) {
        return json({ runningRunId: null })
      }
      return defaultFetch(input)
    })
    render(<AgentSearch />)
    await ask()
    first.push({ type: 'start' })
    first.push({ type: 'text-start', id: 't' })
    first.push({ type: 'text-delta', id: 't', delta: 'Partial' })
    await tick()
    first.push({ type: 'error', errorText: 'The stream broke' })
    await tick(150)
    expect(screen.getByTestId('turn')).toHaveTextContent('Partial|failed|idle')

    const box = screen.getByLabelText('Ask a follow-up')
    fireEvent.change(box, { target: { value: 'Next question' } })
    fireEvent.submit(box.closest('form')!)
    await tick()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await tick()
    // Nothing to cancel yet: the first run is over, the second has no id.
    expect(cancelled).toEqual([])
    expect(secondSignal?.aborted).toBe(false)
    headers.resolve(second.response)
    await tick()
    expect(cancelled).toEqual(['/api/agent-search/asr_2/cancel'])
  })
})

describe('opening conversations', () => {
  test('a slow load of one conversation cannot replace a later one, or come back after New question', async () => {
    const a = deferred<Response>()
    const b = deferred<Response>()
    fetchMock.mockImplementation(async (input: unknown) => {
      if (url(input).endsWith('/conversations/A')) return a.promise
      if (url(input).endsWith('/conversations/B')) return b.promise
      return defaultFetch(input)
    })
    const page = render(<AgentSearch initialConversationId="A" />)
    page.rerender(<AgentSearch initialConversationId="B" />)
    b.resolve(
      json({
        messages: [question('qb', 'Question B'), answer('ab', 'Answer B')],
        runningRunId: null,
      }),
    )
    await tick()
    expect(
      screen.getByRole('heading', { name: 'Question B' }),
    ).toBeInTheDocument()
    expect(window.location.search).toBe('?c=B')
    // A's answer lands late: B stays, and so does its address.
    a.resolve(
      json({
        messages: [question('qa', 'Question A'), answer('aa', 'Answer A')],
        runningRunId: null,
      }),
    )
    await tick()
    expect(
      screen.getByRole('heading', { name: 'Question B' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Question A' })).toBeNull()
    expect(window.location.search).toBe('?c=B')
  })

  test('New question while a conversation loads leaves the load behind', async () => {
    const a = deferred<Response>()
    fetchMock.mockImplementation(async (input: unknown) =>
      url(input).endsWith('/conversations/A') ? a.promise : defaultFetch(input),
    )
    render(<AgentSearch initialConversationId="A" />)
    expect(
      screen.getByRole('status', { name: 'Opening the conversation' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New question' }))
    expect(screen.getByLabelText('Your question')).toBeInTheDocument()
    a.resolve(
      json({
        messages: [question('qa', 'Question A'), answer('aa', 'Answer A')],
        runningRunId: null,
      }),
    )
    await tick()
    expect(screen.queryByRole('heading', { name: 'Question A' })).toBeNull()
    expect(screen.getByLabelText('Your question')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })
})
