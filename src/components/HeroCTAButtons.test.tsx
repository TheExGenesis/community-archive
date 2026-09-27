import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
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
        username: 'exampleuser',
        optedIn: true,
        termsVersion: 'v1.0',
      }),
    })

    expect(
      await screen.findByRole('heading', { name: 'You’re opted in' }),
    ).toBeInTheDocument()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(mockReplace).toHaveBeenCalledWith('/')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
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

  it('shows a retry action when the automatic opt-in is rate limited', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Too Many Requests' }), {
          status: 429,
          headers: { 'Retry-After': '60' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )

    render(<HeroCTAButtons />)

    expect(
      await screen.findByRole('heading', {
        name: 'We couldn’t complete your opt-in',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(
        'Too many requests. Please wait 1 minute and try again.',
      ),
    ).toHaveLength(2)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(
      await screen.findByRole('heading', { name: 'You’re opted in' }),
    ).toBeInTheDocument()
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(mockReplace).toHaveBeenCalledWith('/')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('confirms an OAuth return when the user is already opted in', async () => {
    render(<HeroCTAButtons initialIsOptedIn />)

    expect(
      await screen.findByRole('heading', { name: 'You’re opted in' }),
    ).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(mockReplace).toHaveBeenCalledWith('/')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })
})
