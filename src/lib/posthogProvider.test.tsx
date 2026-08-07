/** @jest-environment jsdom */

import { render, waitFor } from '@testing-library/react'
import React from 'react'
import PostHogProvider from '@/providers/PostHogProvider'

const mockGetSession = jest.fn()
const mockOnAuthStateChange = jest.fn()
const mockInitializePostHog = jest.fn()
const mockDisablePostHogAfterIdentityFailure = jest.fn()

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}))

jest.mock('@/lib/posthog', () => ({
  disablePostHogAfterIdentityFailure: () =>
    mockDisablePostHogAfterIdentityFailure(),
  initializePostHog: (...args: unknown[]) => mockInitializePostHog(...args),
  markPostHogIdentityReady: jest.fn(),
  syncPostHogIdentity: jest.fn(),
}))

describe('PostHogProvider', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockOnAuthStateChange.mockReset()
    mockInitializePostHog.mockReset()
    mockDisablePostHogAfterIdentityFailure.mockReset()
  })

  it('fails closed and resolves analytics readiness when auth bootstrap fails', async () => {
    mockGetSession.mockRejectedValue(new Error('auth unavailable'))

    render(
      <PostHogProvider>
        <div>content</div>
      </PostHogProvider>,
    )

    await waitFor(() => {
      expect(mockDisablePostHogAfterIdentityFailure).toHaveBeenCalledTimes(1)
    })
    expect(mockInitializePostHog).not.toHaveBeenCalled()
    expect(mockOnAuthStateChange).not.toHaveBeenCalled()
  })
})
