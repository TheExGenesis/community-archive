import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { OwnKeyControl, ownKeyRefusalMessage } from './OwnKeyControl'
import { readOwnKey, writeOwnKey } from './ownKeyStore'

const KEY = `sk-or-v1-${'e5'.repeat(32)}`

const checkAnswering = (status: number, body: unknown) => {
  global.fetch = jest.fn(async () => ({
    ok: status < 400,
    status,
    json: async () => body,
  })) as unknown as typeof fetch
}

beforeEach(() => {
  act(() => writeOwnKey(null))
})

test('a key OpenRouter accepts is saved in this browser, and only the header carries it', async () => {
  checkAnswering(200, { ok: true, dailyLimit: 100, limitRemaining: null })
  render(<OwnKeyControl ownLimit={100} />)
  expect(
    screen.getByLabelText(/ask up to 100 questions a day/),
  ).toBeInTheDocument()
  fireEvent.change(screen.getByPlaceholderText('sk-or-…'), {
    target: { value: ` ${KEY} ` },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(
    await screen.findByText(/Your OpenRouter key ending e5e5 pays/),
  ).toBeInTheDocument()
  expect(readOwnKey()).toBe(KEY)
  expect(window.localStorage.getItem('ask-archive.openrouter-key')).toBe(KEY)
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toBe('/api/agent-search/key')
  expect(init.headers).toEqual({ 'x-openrouter-key': KEY })
  expect(init.body).toBeUndefined()

  fireEvent.click(screen.getByRole('button', { name: 'Remove key' }))
  expect(readOwnKey()).toBeNull()
  expect(screen.getByPlaceholderText('sk-or-…')).toBeInTheDocument()
})

test('a refused key is not saved, and the reason is said plainly', async () => {
  checkAnswering(400, { error: 'own_key_no_credit' })
  render(<OwnKeyControl ownLimit={100} />)
  fireEvent.change(screen.getByPlaceholderText('sk-or-…'), {
    target: { value: KEY },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your OpenRouter key has no credit left.',
  )
  expect(readOwnKey()).toBeNull()
})

test('a question refused over the key says how to fix it; other errors pass', () => {
  expect(
    ownKeyRefusalMessage(
      new Error('Failed to fetch chat: 402 {"error":"own_key_no_credit"}'),
    ),
  ).toMatch(/no credit left\. Fix it on OpenRouter, or remove the key/)
  expect(
    ownKeyRefusalMessage(
      new Error('Failed to fetch chat: 429 {"error":"daily_limit"}'),
    ),
  ).toBeNull()
  expect(ownKeyRefusalMessage(undefined)).toBeNull()
})
