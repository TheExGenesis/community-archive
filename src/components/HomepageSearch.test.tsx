/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import HomepageSearch from './HomepageSearch'
import { capturePostHogEvent } from '@/lib/posthog'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))
let mockIsMember = true
jest.mock('@/components/NavigationAudience', () => ({
  useNavigationAudience: () => ({ isMember: mockIsMember, isAdmin: false }),
}))

jest.mock('@/lib/posthog', () => ({
  capturePostHogEvent: jest.fn(),
}))
jest.mock('@/components/UserSearchInput', () => ({
  __esModule: true,
  default: ({
    value,
    onValueChange,
    onKeyDownCapture,
    ...props
  }: {
    value: string
    onValueChange: (value: string) => void
    onKeyDownCapture?: (event: React.KeyboardEvent<HTMLInputElement>) => void
    'aria-label': string
  }) => (
    <input
      value={value}
      aria-label={props['aria-label']}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDownCapture={onKeyDownCapture}
    />
  ),
}))

const mockCapturePostHogEvent = capturePostHogEvent as jest.Mock

describe('HomepageSearch analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('records the search surface without sending the query text', () => {
    render(<HomepageSearch />)

    fireEvent.change(screen.getByLabelText('Search Community Archive'), {
      target: { value: 'a potentially sensitive phrase' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search archive' }))

    expect(mockCapturePostHogEvent).toHaveBeenCalledWith(
      'archive_search_submitted',
      {
        has_query: true,
        active_filter_count: 0,
        surface: 'homepage',
      },
    )
    expect(mockPush).toHaveBeenCalledWith(
      '/search?q=a+potentially+sensitive+phrase',
    )
  })
})

describe('HomepageSearch asking instead', () => {
  beforeEach(() => jest.clearAllMocks())

  it('⌘↵ or the Ask chip hands the text to Ask the archive', () => {
    render(<HomepageSearch />)
    expect(
      screen.queryByRole('button', { name: 'Ask the archive instead' }),
    ).toBeNull()
    const box = screen.getByLabelText('Search Community Archive')
    fireEvent.change(box, { target: { value: 'who writes about singapore' } })
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    expect(mockPush).toHaveBeenLastCalledWith(
      '/search/ask?q=who+writes+about+singapore',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Ask the archive instead' }),
    )
    expect(mockPush).toHaveBeenCalledTimes(2)
  })
})
