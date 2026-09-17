import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ConversationMap from './ConversationMap'

jest.mock('./drawMap', () => ({ drawMap: jest.fn(), hitMap: jest.fn() }))
jest.mock('./conversationMap.module.css', () => ({}))
jest.mock('@/lib/productAnalytics', () => ({ captureProductAction: jest.fn() }))
jest.mock('@/components/TweetCard', () => () => null)

test('year arrows navigate after zooming and stop at the available year boundaries', async () => {
  const originalFetch = global.fetch
  const originalResizeObserver = global.ResizeObserver
  const fonts = Object.getOwnPropertyDescriptor(document, 'fonts')
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  })
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => ({
      year: Number(
        new URL(String(url), 'https://example.com').searchParams.get('year'),
      ),
      years: [2025, 2026],
      annotations: [],
    }),
  })) as jest.Mock
  try {
    render(<ConversationMap initialYear={2026} />)
    const previous = screen.getByRole('button', { name: 'Previous year' })
    const next = screen.getByRole('button', { name: 'Next year' })
    await waitFor(() => expect(previous).toBeEnabled())
    expect(next).toBeDisabled()
    fireEvent.change(screen.getByRole('slider', { name: 'Timeline zoom' }), {
      target: { value: '80' },
    })
    fireEvent.click(previous)
    await waitFor(() => expect(next).toBeEnabled())
    expect(
      screen.getByRole('combobox', { name: 'Explore a year' }),
    ).toHaveValue('2025')
    expect(previous).toBeDisabled()
    fireEvent.change(screen.getByRole('slider', { name: 'Timeline zoom' }), {
      target: { value: '80' },
    })
    fireEvent.click(next)
    await waitFor(() => expect(previous).toBeEnabled())
    expect(
      screen.getByRole('combobox', { name: 'Explore a year' }),
    ).toHaveValue('2026')
  } finally {
    global.fetch = originalFetch
    global.ResizeObserver = originalResizeObserver
    if (fonts) Object.defineProperty(document, 'fonts', fonts)
    else Reflect.deleteProperty(document, 'fonts')
  }
})
