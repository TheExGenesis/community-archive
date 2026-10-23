import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PreviewSessionProvider } from '@/components/PreviewSession'
import { CommunityOptInProvider } from '@/components/CommunityOptIn'
import WhereAmI from './WhereAmI'
jest.mock('./hero.module.css', () => ({}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
}))
let authChange: (
  event: string,
  session: { user: { id: string } } | null,
) => void
const getSession = jest.fn(),
  signInWithOAuth = jest.fn()
jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession,
      signInWithOAuth,
      onAuthStateChange: (callback: typeof authChange) => {
        authChange = callback
        return { data: { subscription: { unsubscribe: jest.fn() } } }
      },
    },
  }),
}))
const fetchMock = jest.fn()
const response = (status: number, body: unknown) => ({
  ok: status === 200,
  json: async () => body,
})
const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Find me on the map' }))
beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  global.fetch = fetchMock
  getSession.mockResolvedValue({ data: { session: null } })
  signInWithOAuth.mockResolvedValue({ error: null })
})
it('shows the requested disclosure before proceeding straight to Twitter', async () => {
  fetchMock.mockResolvedValue(response(401, { status: 'sign_in' }))
  render(
    <CommunityOptInProvider>
      <WhereAmI onLocated={jest.fn()} />
    </CommunityOptInProvider>,
  )
  submit()
  await screen.findByText(
    'Opt in to the Community Archive to find yourself on the map!',
  )
  expect(
    screen.getByText(/lets us keep and share your public tweets/),
  ).toBeVisible()
  expect(signInWithOAuth).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Opt In' }))
  await waitFor(() =>
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'twitter',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=%2F%3Faction%3Doptin%26findme%3D1`,
      },
    }),
  )
})
it('simulates one consent action, plots a public member, and resets on sign-out', async () => {
  fetchMock.mockResolvedValue(
    response(200, { people: [{ username: 'exgenesis', cell: 1414 }] }),
  )
  const onLocated = jest.fn()
  render(
    <PreviewSessionProvider enabled>
      <CommunityOptInProvider>
        <WhereAmI onLocated={onLocated} />
      </CommunityOptInProvider>
    </PreviewSessionProvider>,
  )
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'signed-out' },
  })
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'exgenesis' },
  })
  submit()
  fireEvent.click(await screen.findByRole('button', { name: 'Opt In' }))
  await screen.findByText('@exgenesis is here.')
  expect(
    screen.getByText('Thanks for opting in to the Community Archive!'),
  ).toBeVisible()
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/lookup?name=exgenesis'),
    expect.anything(),
  )
  expect(onLocated).toHaveBeenLastCalledWith([
    {
      username: 'exgenesis',
      cell: 1414,
    },
  ])
  expect(signInWithOAuth).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'signed-out' },
  })
  expect(onLocated).toHaveBeenLastCalledWith([])
  submit()
  await screen.findByRole('button', { name: 'Opt In' })
})
it('lets an opted-in visitor locate another member', async () => {
  fetchMock.mockResolvedValue(
    response(200, {
      status: 'located',
      isSelf: false,
      person: { username: 'someone', cell: 5 },
    }),
  )
  const onLocated = jest.fn()
  render(<WhereAmI onLocated={onLocated} />)
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: '@someone' },
  })
  submit()
  await screen.findByText('@someone is here.')
  expect(onLocated).toHaveBeenLastCalledWith([{ username: 'someone', cell: 5 }])
  expect(screen.getByRole('textbox', { name: 'Find usernames' })).toBeVisible()
})
it('does not plot a late response after sign-out', async () => {
  let resolve!: (value: unknown) => void
  fetchMock.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const onLocated = jest.fn()
  render(<WhereAmI onLocated={onLocated} />)
  submit()
  act(() => authChange('SIGNED_OUT', null))
  await act(async () =>
    resolve(
      response(200, { status: 'located', person: { username: 'me', cell: 4 } }),
    ),
  )
  expect(onLocated).toHaveBeenLastCalledWith([])
})

it('plots multiple names, retains partial matches, and clears without a restore action', async () => {
  fetchMock.mockResolvedValue(
    response(200, {
      status: 'located',
      people: [
        { username: 'one', cell: 4 },
        { username: 'two', cell: 5 },
      ],
      missing: ['absent'],
      isSelf: false,
    }),
  )
  const onLocated = jest.fn(),
    onClear = jest.fn()
  render(
    <WhereAmI onLocated={onLocated} onClear={onClear} hasVisibleUsernames />,
  )
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: '@One, two, @ONE, absent' },
  })
  submit()
  await screen.findByText('@one, @two are here.')
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/me?name=one%2Ctwo%2Cabsent'),
    expect.anything(),
  )
  expect(onLocated).toHaveBeenLastCalledWith([
    { username: 'one', cell: 4 },
    { username: 'two', cell: 5 },
  ])
  expect(screen.getByText('Not found on the map: @absent.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Clear usernames' }))
  expect(onLocated).toHaveBeenLastCalledWith([])
  expect(onClear).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('textbox')).toHaveValue('')
  expect(screen.queryByText('@one, @two are here.')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /Show usernames/ }),
  ).not.toBeInTheDocument()
})
it('cancels a pending search when usernames are cleared', async () => {
  let resolve!: (value: unknown) => void
  fetchMock.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const onLocated = jest.fn()
  render(<WhereAmI onLocated={onLocated} hasVisibleUsernames />)
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'one, two' },
  })
  submit()
  fireEvent.click(screen.getByRole('button', { name: 'Clear usernames' }))
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
  await act(async () =>
    resolve(
      response(200, {
        status: 'located',
        people: [{ username: 'one', cell: 4 }],
      }),
    ),
  )
  expect(onLocated).toHaveBeenLastCalledWith([])
  expect(screen.getByRole('textbox')).toHaveValue('')
  expect(screen.queryByText('@one is here.')).not.toBeInTheDocument()
})
it('rejects invalid lists before requesting a lookup', () => {
  render(<WhereAmI onLocated={jest.fn()} />)
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'one, bad!' },
  })
  submit()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(screen.getByText(/Enter up to 20 valid/)).toBeVisible()
})

it('only offers clearing while map username labels are visible', () => {
  const onLocated = jest.fn()
  const { rerender } = render(
    <WhereAmI onLocated={onLocated} hasVisibleUsernames={false} />,
  )
  expect(
    screen.queryByRole('button', { name: 'Clear usernames' }),
  ).not.toBeInTheDocument()
  rerender(<WhereAmI onLocated={onLocated} hasVisibleUsernames />)
  expect(screen.getByRole('button', { name: 'Clear usernames' })).toBeVisible()
  rerender(<WhereAmI onLocated={onLocated} hasVisibleUsernames={false} />)
  expect(
    screen.queryByRole('button', { name: 'Clear usernames' }),
  ).not.toBeInTheDocument()
})

it('plots immediately after the signed-in visitor saves consent', async () => {
  getSession.mockResolvedValue({
    data: {
      session: {
        user: {
          identities: [
            {
              provider: 'twitter',
              identity_data: { user_name: 'me_one', provider_id: '123' },
            },
          ],
        },
      },
    },
  })
  fetchMock
    .mockResolvedValueOnce(
      response(403, { status: 'opt_in', username: 'me_one' }),
    )
    .mockResolvedValueOnce(response(200, { success: true }))
    .mockResolvedValueOnce(
      response(200, {
        status: 'located',
        isSelf: true,
        person: { username: 'me_one', cell: 4 },
      }),
    )
  const onLocated = jest.fn()
  render(
    <CommunityOptInProvider>
      <WhereAmI onLocated={onLocated} />
    </CommunityOptInProvider>,
  )
  submit()
  fireEvent.click(await screen.findByRole('button', { name: 'Opt In' }))
  await screen.findByText('You are here, @me_one.')
  expect(onLocated).toHaveBeenLastCalledWith({ username: 'me_one', cell: 4 })
  expect(fetchMock.mock.calls.map(([url]) => url.split('?')[0])).toEqual([
    '/api/hex-map/me',
    '/api/opt-in',
    '/api/hex-map/me',
  ])
})
