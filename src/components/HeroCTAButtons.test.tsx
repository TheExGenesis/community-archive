import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import HeroCTAButtons from './HeroCTAButtons'
import { CommunityOptInProvider } from './CommunityOptIn'
import { PreviewSessionProvider } from './PreviewSession'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'

const replace = jest.fn(),
  refresh = jest.fn()
const getSession = jest.fn(),
  signInWithOAuth = jest.fn()
const unsubscribe = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}))
jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession,
      signInWithOAuth,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe } } }),
    },
  }),
}))
jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))
const fetchMock = jest.fn()
const user = {
  id: 'verified-session',
  app_metadata: { provider_id: '123', user_name: 'exampleuser' },
}
const renderFlow = (preview = false) =>
  render(
    <PreviewSessionProvider enabled={preview}>
      <CommunityOptInProvider>
        <HeroCTAButtons />
      </CommunityOptInProvider>
    </PreviewSessionProvider>,
  )
beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  getSession.mockResolvedValue({ data: { session: null } })
  signInWithOAuth.mockResolvedValue({ error: null })
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  })
  global.fetch = fetchMock
})
it('discloses consent before OAuth and saves pending intent only after confirmation', async () => {
  renderFlow()
  fireEvent.click(screen.getByRole('button', { name: 'Opt in' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent(
    'Opt in to the Community Archive to find yourself on the map.',
  )
  expect(screen.getByRole('link', { name: 'Data Policy' })).toHaveAttribute(
    'href',
    '/data-policy',
  )
  expect(signInWithOAuth).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Opt In' }))
  await waitFor(() =>
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'twitter',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=%2F%3Faction%3Doptin`,
      },
    }),
  )
  expect(sessionStorage.getItem('community-archive-opt-in')).toBeTruthy()
  expect(fetchMock).not.toHaveBeenCalled()
})
it('completes consent after OAuth once and thanks the user without a second prompt', async () => {
  window.history.replaceState({}, '', '/?action=optin&findme=1')
  sessionStorage.setItem(
    'community-archive-opt-in',
    JSON.stringify({ at: Date.now() }),
  )
  getSession.mockResolvedValue({ data: { session: { user } } })
  renderFlow()
  await screen.findByText('Thanks for opting in to the Community Archive!')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/opt-in',
    expect.objectContaining({
      body: JSON.stringify({
        username: 'exampleuser',
        optedIn: true,
        termsVersion: 'v1.0',
      }),
    }),
  )
  expect(sessionStorage.getItem('community-archive-opt-in')).toBeNull()
  expect(replace).toHaveBeenCalledWith('/?findme=1')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it.each([null, { at: Date.now() - 31 * 60 * 1000 }])(
  'does not save consent from a return URL with absent or expired intent: %p',
  async (intent) => {
    window.history.replaceState({}, '', '/?action=optin')
    if (intent)
      sessionStorage.setItem('community-archive-opt-in', JSON.stringify(intent))
    getSession.mockResolvedValue({ data: { session: { user } } })
    renderFlow()
    await screen.findByRole('button', { name: 'Opt in' })
    expect(fetchMock).not.toHaveBeenCalled()
  },
)
it('simulates the whole shared login and consent without OAuth or a consent write', async () => {
  function AccountState() {
    const { userMetadata } = useAuthAndArchive()
    return (
      <p>
        {userMetadata ? 'Account menu: signed in' : 'Account menu: signed out'}
      </p>
    )
  }
  render(
    <PreviewSessionProvider enabled>
      <CommunityOptInProvider>
        <HeroCTAButtons />
        <AccountState />
      </CommunityOptInProvider>
    </PreviewSessionProvider>,
  )
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'signed-out' },
  })
  expect(screen.getByText('Account menu: signed out')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Opt in' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Opt In' }),
  )
  await screen.findByText('Thanks for opting in to the Community Archive!')
  expect(screen.getByText('Account menu: signed in')).toBeVisible()
  expect(signInWithOAuth).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'signed-out' },
  })
  expect(
    screen.queryByText('Thanks for opting in to the Community Archive!'),
  ).not.toBeInTheDocument()
  expect(screen.getByText('Account menu: signed out')).toBeVisible()
})
it('reports a failed consent write without thanking the user', async () => {
  getSession.mockResolvedValue({ data: { session: { user } } })
  fetchMock.mockResolvedValue({
    ok: false,
    status: 500,
    headers: new Headers(),
    json: async () => ({ error: 'Consent unavailable' }),
  })
  renderFlow()
  fireEvent.click(screen.getByRole('button', { name: 'Opt in' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Opt In' }),
  )
  await waitFor(() =>
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      'Consent unavailable',
    ),
  )
  expect(
    screen.queryByText('Thanks for opting in to the Community Archive!'),
  ).not.toBeInTheDocument()
})
