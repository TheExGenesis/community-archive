import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import WhereAmI from './WhereAmI'
import { updateOptIn } from '@/lib/optInApi'

jest.mock('./hero.module.css', () => ({}))

let authChange: (
  event: string,
  session: { user: { id: string } } | null,
) => void
const unsubscribe = jest.fn()
jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({
    auth: {
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
  global.fetch = fetchMock
  window.history.replaceState(null, '', '/')
})
it('offers sign-in without opting the visitor in', async () => {
  fetchMock.mockResolvedValue(
    response(401, {
      status: 'sign_in',
      error: 'Sign in with X to find yourself on the map.',
    }),
  )
  const onLocated = jest.fn()
  render(<WhereAmI onLocated={onLocated} />)
  submit()
  expect(
    await screen.findByRole('link', { name: 'Sign in with X' }),
  ).toHaveAttribute('href', '/login?redirect=%2F%3Ffindme%3D1')
  expect(updateOptIn).not.toHaveBeenCalled()
  expect(onLocated).not.toHaveBeenCalledWith(
    expect.objectContaining({ cell: expect.any(Number) }),
  )
})
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
