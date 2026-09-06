import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProfileContent from './ProfileContent'

const mockFetch = jest.fn()
const originalFetch = global.fetch
const mockLogInsert = jest.fn().mockResolvedValue({ error: null })
const mockRpc = jest.fn()
const mockUpdateDownloadArchiveVisibility = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}))

jest.mock('@/hooks/useAuthAndArchive', () => ({
  useAuthAndArchive: () => ({
    userMetadata: { user_name: 'ExampleUser', provider_id: 'twitter-123' },
  }),
}))

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({
    from: () => ({ insert: mockLogInsert }),
    rpc: mockRpc,
    storage: { from: jest.fn() },
  }),
}))

jest.mock('@/lib/db_insert', () => ({
  deleteArchive: jest.fn(),
  deleteSingleArchive: jest.fn(),
}))

jest.mock('@/lib/posthog', () => ({
  capturePostHogEvent: jest.fn(),
}))

jest.mock('@/app/user/[account_id]/actions', () => ({
  updateDownloadArchiveVisibility: (...args: unknown[]) =>
    mockUpdateDownloadArchiveVisibility(...args),
}))

const user = {
  id: 'auth-user-123',
  user_metadata: {
    user_name: 'ExampleUser',
    provider_id: 'twitter-123',
  },
  app_metadata: {},
} as any

describe('ProfileContent opt-in preference', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = mockFetch
    mockUpdateDownloadArchiveVisibility.mockResolvedValue({ ok: true })
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('shows retry timing and preserves the prior state after a 429', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: { 'Retry-After': '60' },
      }),
    )

    render(<ProfileContent user={user} initialOptInData={null} archives={[]} />)

    const optInSwitch = screen.getByRole('switch', {
      name: /opt-in to tweet streaming/i,
    })
    fireEvent.click(optInSwitch)

    expect(
      await screen.findByText(
        'Too many requests. Please wait 1 minute and try again.',
      ),
    ).toBeInTheDocument()
    expect(optInSwitch).not.toBeChecked()
    await waitFor(() => expect(optInSwitch).toBeEnabled())
  })

  it('allows only one opt-in mutation while the request is in flight', async () => {
    let resolveRequest: (response: Response) => void = () => undefined
    mockFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve
        }),
    )

    render(<ProfileContent user={user} initialOptInData={null} archives={[]} />)

    const optInSwitch = screen.getByRole('switch', {
      name: /opt-in to tweet streaming/i,
    })
    fireEvent.click(optInSwitch)
    fireEvent.click(optInSwitch)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(optInSwitch).toBeDisabled()

    resolveRequest(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )

    await waitFor(() => expect(optInSwitch).toBeChecked())
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('shows Download Archive by default and lets the owner hide it', async () => {
    render(
      <ProfileContent
        user={user}
        accountId="42"
        initialOptInData={null}
        archives={[]}
      />,
    )

    const visibilitySwitch = screen.getByRole('switch', {
      name: /show download archive/i,
    })
    expect(visibilitySwitch).toBeChecked()

    fireEvent.click(visibilitySwitch)

    await waitFor(() =>
      expect(mockUpdateDownloadArchiveVisibility).toHaveBeenCalledWith(
        '42',
        false,
      ),
    )
    expect(visibilitySwitch).not.toBeChecked()
    expect(
      screen.getByText('Download Archive is hidden from your public profile'),
    ).toBeVisible()
  })

  it('lets the owner permanently delete one of their tweets', async () => {
    const interaction = userEvent.setup()
    jest.spyOn(window, 'confirm').mockReturnValue(true)
    mockRpc.mockResolvedValue({
      data: [{ deleted_tweets: 1 }],
      error: null,
    })

    render(
      <ProfileContent
        user={user}
        accountId="twitter-123"
        initialOptInData={null}
        archives={[]}
        initialTweets={[
          {
            tweet_id: '1234567890',
            created_at: '2026-08-15T00:00:00.000Z',
            full_text: 'A tweet I can remove',
            favorite_count: 3,
            retweet_count: 1,
          },
        ]}
      />,
    )

    await interaction.click(screen.getByRole('tab', { name: 'My Tweets' }))
    await interaction.click(
      screen.getByRole('button', { name: 'Delete tweet 1234567890' }),
    )

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('delete_own_tweets', {
        p_tweet_ids: ['1234567890'],
      }),
    )
    expect(await screen.findByText('Tweet deleted permanently')).toBeVisible()
    expect(screen.queryByText('A tweet I can remove')).not.toBeInTheDocument()
  })
})
