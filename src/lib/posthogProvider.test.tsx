/** @jest-environment jsdom */

import { act, render, waitFor } from '@testing-library/react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import React from 'react'
import PostHogProvider from '@/providers/PostHogProvider'

const mockUnsubscribe = jest.fn()
const mockOnAuthStateChange = jest.fn()
const mockInitializePostHog = jest.fn()
const mockDisablePostHogAfterIdentityFailure = jest.fn()

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({
    auth: { onAuthStateChange: mockOnAuthStateChange },
  }),
}))

jest.mock('@/lib/posthog', () => ({
  disablePostHogAfterIdentityFailure: () =>
    mockDisablePostHogAfterIdentityFailure(),
  initializePostHog: (...args: unknown[]) => mockInitializePostHog(...args),
}))

describe('PostHogProvider', () => {
  let callback: (event: AuthChangeEvent, session: Session | null) => void
  beforeEach(() => {
    jest.clearAllMocks()
    mockInitializePostHog.mockResolvedValue({
      enabled: false,
      identifiedUserId: null,
    })
    mockOnAuthStateChange.mockImplementation((handler) => {
      callback = handler
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
    })
  })

  it('keeps listening after a signed-out initial session and handles login/logout', async () => {
    const { unmount } = render(
      <PostHogProvider>
        <div>content</div>
      </PostHogProvider>,
    )
    await waitFor(() => expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1))
    const session = { user: { id: 'user-123' } } as Session
    await act(async () => callback('INITIAL_SESSION', null))
    expect(mockInitializePostHog).toHaveBeenLastCalledWith(null)
    await act(async () => callback('SIGNED_IN', session))
    expect(mockInitializePostHog).toHaveBeenLastCalledWith(session)
    await act(async () => callback('SIGNED_OUT', null))
    expect(mockInitializePostHog).toHaveBeenLastCalledWith(null)
    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })

  it('fails closed when identity initialization fails', async () => {
    mockInitializePostHog.mockRejectedValue(new Error('auth unavailable'))
    render(
      <PostHogProvider>
        <div>content</div>
      </PostHogProvider>,
    )
    await waitFor(() => expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1))
    await act(async () => callback('INITIAL_SESSION', null))
    expect(mockDisablePostHogAfterIdentityFailure).toHaveBeenCalledTimes(1)
  })
})
