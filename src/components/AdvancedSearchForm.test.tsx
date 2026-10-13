/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import AdvancedSearchForm from './AdvancedSearchForm'
import { capturePostHogEvent } from '@/lib/posthog'

const mockPush = jest.fn()
const mockParams = new URLSearchParams('q=singapore&fromUser=visakanv')

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockParams,
}))
let mockIsMember = true
jest.mock('@/components/NavigationAudience', () => ({
  useNavigationAudience: () => ({ isMember: mockIsMember, isAdmin: false }),
}))
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))
jest.mock('@/components/UserSearchInput', () => ({
  __esModule: true,
  default: ({
    value,
    onValueChange,
    onKeyDownCapture,
    id,
  }: {
    value: string
    onValueChange: (value: string) => void
    onKeyDownCapture?: (event: React.KeyboardEvent<HTMLInputElement>) => void
    id?: string
  }) => (
    <input
      id={id}
      aria-label="Search the archive"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDownCapture={onKeyDownCapture}
    />
  ),
}))

beforeEach(() => jest.clearAllMocks())

test('Ask hands the query and filters to Ask the archive without sending', () => {
  render(<AdvancedSearchForm />)
  const ask = screen.getByRole('button', { name: /^Ask/ })
  expect(ask).toHaveAttribute(
    'title',
    'Ask the archive: reads the tweets and writes a cited answer',
  )
  fireEvent.click(ask)
  expect(mockPush).toHaveBeenCalledWith(
    '/search/ask?q=singapore&fromUser=visakanv',
  )
  expect(capturePostHogEvent).toHaveBeenCalledWith(
    'search_interface_action',
    expect.objectContaining({ action: 'ask_from_search' }),
  )
})

test('⌘↵ or Ctrl↵ in the box asks; plain Enter still searches', () => {
  render(<AdvancedSearchForm />)
  const box = screen.getByLabelText('Search the archive')
  fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
  expect(mockPush).toHaveBeenLastCalledWith(
    '/search/ask?q=singapore&fromUser=visakanv',
  )
  fireEvent.submit(box.closest('form') as HTMLFormElement)
  expect(mockPush).toHaveBeenCalledTimes(2)
  expect(mockPush.mock.calls[1][0]).toMatch(/^\/search(\?|$)/)
})

test('Ask is disabled with nothing to ask about', () => {
  render(<AdvancedSearchForm />)
  fireEvent.change(screen.getByLabelText('Search the archive'), {
    target: { value: '' },
  })
  expect(screen.getByRole('button', { name: /^Ask/ })).toBeDisabled()
})
