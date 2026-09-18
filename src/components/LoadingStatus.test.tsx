import { act, render, screen } from '@testing-library/react'
import { LoadingStatus } from './LoadingStatus'

afterEach(() => jest.useRealTimers())
test('stages elapsed-time hints and clears timers on completion', () => {
  jest.useFakeTimers()
  const { unmount } = render(
    <LoadingStatus label="Loading…" slowLabel="Still loading…" />,
  )
  expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  act(() => jest.advanceTimersByTime(2000))
  expect(screen.getByRole('status')).toHaveTextContent('Still loading…')
  act(() => jest.advanceTimersByTime(8000))
  expect(screen.getByRole('status')).toHaveTextContent(
    'taking longer than usual',
  )
  unmount()
  expect(jest.getTimerCount()).toBe(0)
})
test('a replacement request starts with the initial hint', () => {
  jest.useFakeTimers()
  const { rerender, unmount } = render(
    <LoadingStatus key="first" label="Loading…" slowLabel="Still loading…" />,
  )
  act(() => jest.advanceTimersByTime(10000))
  rerender(
    <LoadingStatus key="second" label="Loading…" slowLabel="Still loading…" />,
  )
  expect(screen.getByRole('status').textContent).toBe('Loading…')
  unmount()
  expect(jest.getTimerCount()).toBe(0)
})
