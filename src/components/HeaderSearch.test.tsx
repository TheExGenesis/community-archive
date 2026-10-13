/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import HeaderSearch from './HeaderSearch'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))
jest.mock('@/components/UserSearchInput', () => ({
  __esModule: true,
  default: ({
    value,
    onValueChange,
    onKeyDownCapture,
  }: {
    value: string
    onValueChange: (value: string) => void
    onKeyDownCapture?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  }) => (
    <input
      aria-label="Search Community Archive"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDownCapture={onKeyDownCapture}
    />
  ),
}))

beforeEach(() => jest.clearAllMocks())

test('⌘↵ or Ctrl↵ in the header box asks; an empty box does nothing', () => {
  render(<HeaderSearch />)
  const box = screen.getByRole('textbox', { name: 'Search Community Archive' })
  fireEvent.keyDown(box, { key: 'Enter', metaKey: true })
  expect(mockPush).not.toHaveBeenCalled()
  fireEvent.change(box, { target: { value: 'who writes about singapore' } })
  fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
  expect(mockPush).toHaveBeenCalledWith(
    '/search/ask?q=who+writes+about+singapore',
  )
})

test('the header box shows an Ask chip once it has text, which asks', () => {
  render(<HeaderSearch />)
  expect(
    screen.queryByRole('button', { name: 'Ask the archive instead' }),
  ).toBeNull()
  const box = screen.getByRole('textbox', { name: 'Search Community Archive' })
  fireEvent.change(box, { target: { value: 'singapore' } })
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask the archive instead' }),
  )
  expect(mockPush).toHaveBeenCalledWith('/search/ask?q=singapore')
})
