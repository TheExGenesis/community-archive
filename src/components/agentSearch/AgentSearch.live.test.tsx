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
  }: {
    view: TurnView
    interrupted?: TurnInterruption | null
    active: boolean
    onStop?: () => void
  }) => (
    <div data-testid="turn">
      {view.answer.markdown}|{interrupted?.kind ?? view.outcome}|
      {active ? <button onClick={onStop}>Stop</button> : 'idle'}
    </div>
  ),
}))
jest.mock('./StepLog', () => ({
  StepLog: ({ mode, onStop }: { mode: string; onStop?: () => void }) => (
    <div data-testid="log">
      {mode}
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

describe('Stop', () => {
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
