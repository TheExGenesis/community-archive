import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import PostHogMonitoring from './PostHogMonitoring'

const mockPostHog = {
  __loaded: false,
  get_distinct_id: jest.fn(() => 'anonymous-id'),
  identify: jest.fn(),
  init: jest.fn(),
  reset: jest.fn(),
}

const mockGetSession = jest.fn()
const mockUnsubscribe = jest.fn()
let mockAuthStateChangeCallback: (event: string, session: any) => void

const mockOnAuthStateChange = jest.fn((callback) => {
  mockAuthStateChangeCallback = callback
  return {
    data: {
      subscription: {
        unsubscribe: mockUnsubscribe,
      },
    },
  }
})

const mockCreateBrowserClient = jest.fn(() => ({
  auth: {
    getSession: mockGetSession,
    onAuthStateChange: mockOnAuthStateChange,
  },
}))

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: mockPostHog,
}))

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: mockCreateBrowserClient,
}))

describe('PostHogMonitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPostHog.__loaded = false
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-123' },
        },
      },
    })
  })

  it('does not load monitoring without a project token', async () => {
    render(<PostHogMonitoring projectToken="" />)

    await act(async () => {})

    expect(mockCreateBrowserClient).not.toHaveBeenCalled()
    expect(mockPostHog.init).not.toHaveBeenCalled()
  })

  it('initializes monitoring and follows the authenticated user lifecycle', async () => {
    const { unmount } = render(
      <PostHogMonitoring
        host="https://eu.i.posthog.com"
        projectToken="phc_test"
      />,
    )

    await waitFor(() => {
      expect(mockPostHog.init).toHaveBeenCalledWith(
        'phc_test',
        expect.objectContaining({
          api_host: 'https://eu.i.posthog.com',
          capture_exceptions: true,
          capture_pageview: 'history_change',
          capture_performance: { web_vitals: true },
          mask_personal_data_properties: true,
          session_recording: { maskAllInputs: true },
        }),
      )
    })

    await waitFor(() => {
      expect(mockPostHog.identify).toHaveBeenCalledWith('user-123')
    })

    act(() => {
      mockAuthStateChangeCallback('SIGNED_OUT', null)
    })

    expect(mockPostHog.reset).toHaveBeenCalledTimes(1)

    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
