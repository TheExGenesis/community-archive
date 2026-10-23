import { PreviewSessionProvider } from '@/components/PreviewSession'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import WhereAmI from './WhereAmI'
import { updateOptIn } from '@/lib/optInApi'

jest.mock('./hero.module.css', () => ({}))

let authChange: (
  event: string,
  session: { user: { id: string } } | null,
) => void
const unsubscribe = jest.fn()
const signInWithOAuth = jest.fn()
jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({
    auth: {
      signInWithOAuth,
      onAuthStateChange: (callback: typeof authChange) => {
        authChange = callback
        return { data: { subscription: { unsubscribe } } }
      },
    },
  }),
}))
jest.mock('@/lib/optInApi', () => ({ updateOptIn: jest.fn() }))
const fetchMock = jest.fn()
const response = (status: number, body: unknown) => ({
  ok: status === 200,
  status,
  json: async () => body,
})
const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Find me on the map' }))
beforeEach(() => {
  jest.clearAllMocks()
  signInWithOAuth.mockReset().mockResolvedValue({ error: null })
  global.fetch = fetchMock
  window.history.replaceState(null, '', '/')
})
it('opens Twitter directly from Opt In and returns to the map without automatic consent', async () => {
  fetchMock.mockResolvedValue(
    response(401, {
      status: 'sign_in',
      error: 'Opt in with Twitter to find yourself on the map.',
    }),
  )
  const onLocated = jest.fn()
  render(<WhereAmI onLocated={onLocated} />)
  submit()
  fireEvent.click(await screen.findByRole('button', { name: 'Opt In' }))
  await screen.findByText('Opening Twitter…')
  expect(signInWithOAuth).toHaveBeenCalledWith({
    provider: 'twitter',
    options: {
      redirectTo: `${window.location.origin}/api/auth/callback?next=%2F%3Ffindme%3D1`,
    },
  })
  expect(
    screen.queryByRole('link', { name: /sign in/i }),
  ).not.toBeInTheDocument()
  expect(updateOptIn).not.toHaveBeenCalled()
  expect(onLocated).not.toHaveBeenCalledWith(
    expect.objectContaining({ cell: expect.any(Number) }),
  )
})
it.each(['returned', 'thrown'])(
  'allows retry after a %s OAuth error',
  async (failure) => {
    fetchMock.mockResolvedValue(response(401, { status: 'sign_in' }))
    if (failure === 'returned')
      signInWithOAuth.mockResolvedValueOnce({ error: new Error('Unavailable') })
    else signInWithOAuth.mockRejectedValueOnce(new Error('Unavailable'))
    render(<WhereAmI onLocated={jest.fn()} />)
    submit()
    fireEvent.click(await screen.findByRole('button', { name: 'Opt In' }))
    await screen.findByText('Could not connect to Twitter. Please try again.')
    fireEvent.click(screen.getByRole('button', { name: 'Opt In' }))
    await screen.findByText('Opening Twitter…')
    expect(signInWithOAuth).toHaveBeenCalledTimes(2)
    expect(updateOptIn).not.toHaveBeenCalled()
  },
)
it('requires a separate explicit consent action before plotting', async () => {
  fetchMock
    .mockResolvedValueOnce(
      response(403, {
        status: 'opt_in',
        username: 'me',
        error: 'Opt in first.',
      }),
    )
    .mockResolvedValueOnce(
      response(200, { status: 'located', person: { username: 'me', cell: 4 } }),
    )
  jest.mocked(updateOptIn).mockResolvedValue(null)
  const onLocated = jest.fn()
  render(<WhereAmI onLocated={onLocated} />)
  submit()
  const consent = await screen.findByRole('button', {
    name: 'Opt in and find me',
  })
  expect(screen.getByRole('link', { name: 'Data Policy' })).toBeVisible()
  expect(updateOptIn).not.toHaveBeenCalled()
  fireEvent.click(consent)
  await screen.findByText('You are here, @me.')
  expect(updateOptIn).toHaveBeenCalledWith({
    username: 'me',
    optedIn: true,
    termsVersion: 'v1.0',
  })
  expect(onLocated).toHaveBeenLastCalledWith({ username: 'me', cell: 4 })
})
it('resumes the read-only lookup after sign-in without automatic consent', async () => {
  window.history.replaceState(null, '', '/?findme=1')
  fetchMock.mockResolvedValue(
    response(403, { status: 'opt_in', username: 'me' }),
  )
  render(<WhereAmI onLocated={jest.fn()} />)
  await screen.findByRole('button', { name: 'Opt in and find me' })
  expect(updateOptIn).not.toHaveBeenCalled()
})
it('shows a missing-map result without creating a pin', async () => {
  fetchMock.mockResolvedValue(
    response(404, { status: 'not_mapped', error: 'Not on this map yet.' }),
  )
  const onLocated = jest.fn()
  render(<WhereAmI onLocated={onLocated} />)
  submit()
  await screen.findByText('Not on this map yet.')
  expect(onLocated).toHaveBeenCalledTimes(1)
  expect(onLocated).toHaveBeenCalledWith(null)
})
it('ignores an in-flight lookup after sign-out', async () => {
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
  expect(onLocated).not.toHaveBeenCalledWith(
    expect.objectContaining({ cell: 4 }),
  )
  expect(screen.queryByText('You are here, @me.')).not.toBeInTheDocument()
})
it('clears a pin when the signed-in account changes', async () => {
  fetchMock.mockResolvedValue(
    response(200, { status: 'located', person: { username: 'me', cell: 4 } }),
  )
  const onLocated = jest.fn()
  render(<WhereAmI onLocated={onLocated} />)
  act(() => authChange('INITIAL_SESSION', { user: { id: 'first' } }))
  submit()
  await waitFor(() =>
    expect(onLocated).toHaveBeenLastCalledWith({ username: 'me', cell: 4 }),
  )
  act(() => authChange('SIGNED_IN', { user: { id: 'second' } }))
  expect(onLocated).toHaveBeenLastCalledWith(null)
  expect(screen.getByRole('textbox', { name: 'Where am I?' })).toHaveValue('')
})

it('simulates login and explicit consent before looking up public map members', async () => {
  fetchMock.mockResolvedValue(
    response(200, { people: [{ username: 'exgenesis', cell: 1414 }] }),
  )
  const onLocated = jest.fn()
  render(
    <PreviewSessionProvider enabled>
      <WhereAmI onLocated={onLocated} />
    </PreviewSessionProvider>,
  )
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Preview sign-in state' }),
    { target: { value: 'signed-out' } },
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Where am I?' }), {
    target: { value: 'exgenesis' },
  })
  submit()
  fireEvent.click(await screen.findByRole('button', { name: 'Opt In' }))
  const consent = await screen.findByRole('button', {
    name: 'Opt in and find me',
  })
  expect(fetchMock).not.toHaveBeenCalled()
  expect(signInWithOAuth).not.toHaveBeenCalled()
  fireEvent.click(consent)
  await screen.findByText('@exgenesis is here.')
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/lookup?name=exgenesis'),
    expect.anything(),
  )
  expect(updateOptIn).not.toHaveBeenCalled()
  expect(onLocated).toHaveBeenLastCalledWith({
    username: 'exgenesis',
    cell: 1414,
  })
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Preview sign-in state' }),
    { target: { value: 'signed-out' } },
  )
  expect(onLocated).toHaveBeenLastCalledWith(null)
  submit()
  await screen.findByRole('button', { name: 'Opt In' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('simulates the Opt In action from the actual dev session without opening OAuth', async () => {
  fetchMock.mockResolvedValue(response(401, { status: 'sign_in' }))
  render(
    <PreviewSessionProvider enabled>
      <WhereAmI onLocated={jest.fn()} />
    </PreviewSessionProvider>,
  )
  submit()
  fireEvent.click(await screen.findByRole('button', { name: 'Opt In' }))
  await screen.findByRole('button', { name: 'Opt in and find me' })
  expect(signInWithOAuth).not.toHaveBeenCalled()
  expect(updateOptIn).not.toHaveBeenCalled()
})

it('lets an opted-in visitor search another member and identifies the result correctly', async () => {
  fetchMock.mockResolvedValue(
    response(200, {
      status: 'located',
      isSelf: false,
      person: { username: 'someone', cell: 5 },
    }),
  )
  const onLocated = jest.fn()
  render(<WhereAmI onLocated={onLocated} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Where am I?' }), {
    target: { value: '@someone' },
  })
  submit()
  await screen.findByText('@someone is here.')
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/me?name=%40someone'),
    expect.anything(),
  )
  expect(
    screen.getByRole('textbox', { name: 'Find username' }),
  ).toHaveAttribute('placeholder', 'Find any username…')
  expect(onLocated).toHaveBeenLastCalledWith({ username: 'someone', cell: 5 })
})

it('resumes the authenticated self flow after OAuth even in the default preview view', async () => {
  window.history.replaceState(null, '', '/?findme=1')
  fetchMock.mockResolvedValue(
    response(403, { status: 'opt_in', username: 'me' }),
  )
  render(
    <PreviewSessionProvider enabled>
      <WhereAmI onLocated={jest.fn()} />
    </PreviewSessionProvider>,
  )
  await screen.findByRole('button', { name: 'Opt in and find me' })
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/me?name='),
    expect.anything(),
  )
  expect(updateOptIn).not.toHaveBeenCalled()
})
