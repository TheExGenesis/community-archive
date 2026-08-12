/** @jest-environment jsdom */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import HomepageSearch from './HomepageSearch'
import { capturePostHogEvent } from '@/lib/posthog'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/lib/posthog', () => ({
  capturePostHogEvent: jest.fn(),
}))
jest.mock('@/components/UserSearchInput', () => ({
  __esModule: true,
  default: ({
    value,
    onValueChange,
    ...props
  }: {
    value: string
    onValueChange: (value: string) => void
    'aria-label': string
  }) => (
    <input
      value={value}
      aria-label={props['aria-label']}
      onChange={(event) => onValueChange(event.target.value)}
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
