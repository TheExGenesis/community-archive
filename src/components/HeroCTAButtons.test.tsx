import React from 'react'
import { render, waitFor } from '@testing-library/react'
import HeroCTAButtons from './HeroCTAButtons'

const mockReplace = jest.fn()
const mockRefresh = jest.fn()
const mockUnsubscribe = jest.fn()
const mockSingle = jest.fn()
const mockFetch = jest.fn()
const originalFetch = global.fetch

const mockSupabase = {
  auth: {
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    })),
    signInWithOAuth: jest.fn(),
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({ single: mockSingle })),
    })),
  })),
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

jest.mock('@/hooks/useAuthAndArchive', () => ({
  useAuthAndArchive: () => ({
    userMetadata: { user_name: 'ExampleUser', provider_id: 'twitter-123' },
  }),
}))

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => mockSupabase,
}))

describe('HeroCTAButtons', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.history.replaceState({}, '', '/?action=optin')
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-user-123' } } },
    })
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
    global.fetch = mockFetch
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('completes a pending opt-in when the user returns from OAuth', async () => {
    render(<HeroCTAButtons />)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    expect(mockFetch).toHaveBeenCalledWith('/api/opt-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'auth-user-123',
        username: 'exampleuser',
        twitterUserId: 'twitter-123',
        optedIn: true,
        termsVersion: 'v1.0',
      }),
    })

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/')
      expect(mockRefresh).toHaveBeenCalledTimes(1)
    })
  })

  it('does not opt in automatically without the OAuth return action', async () => {
    window.history.replaceState({}, '', '/')

    render(<HeroCTAButtons />)

    await waitFor(() => {
      expect(mockSupabase.auth.getSession).toHaveBeenCalledTimes(1)
      expect(mockSingle).toHaveBeenCalledTimes(1)
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
