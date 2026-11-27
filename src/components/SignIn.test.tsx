import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SignIn from './SignIn'

const push = jest.fn()
const setView = jest.fn()
let preview = { enabled: true, view: 'actual', setView }
let userMetadata: unknown = null

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams('redirect=/admin'),
}))
jest.mock('@/components/PreviewSession', () => ({
  usePreviewSession: () => preview,
}))
jest.mock('@/hooks/useAuthAndArchive', () => ({
  useAuthAndArchive: () => ({ userMetadata }),
}))
jest.mock('@/components/NavigationAudience', () => ({
  useNavigationAudience: () => ({ localPreview: null }),
}))
jest.mock('@/utils/supabase', () => ({ createBrowserClient: jest.fn() }))

const env = { ...process.env }
const fetchMock = jest.fn()
// jest.polyfills.js swaps in undici's FormData, which cannot read a jsdom
// <form>; React builds one for form actions, and signIn ignores it.
const realFormData = global.FormData
beforeAll(() => {
  global.FormData = class {} as unknown as typeof FormData
})
afterAll(() => {
  global.FormData = realFormData
})

beforeEach(() => {
  push.mockReset()
  setView.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
  global.fetch = fetchMock as unknown as typeof fetch
  preview = { enabled: true, view: 'actual', setView }
  userMetadata = null
  process.env.NEXT_PUBLIC_ENABLE_STAGING_DEV_LOGIN = 'true'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://staging-ref.supabase.co'
})
afterAll(() => {
  process.env = env
})

test('a preview with staging login signs in for real so the server sees the session', async () => {
  render(<SignIn fullPage />)
  fireEvent.change(screen.getByLabelText('Pick staging mock user'), {
    target: { value: 'xiq_dev' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in as XIQ Dev' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/auth/dev-login')
  expect(JSON.parse(init.body)).toMatchObject({ username: 'xiq_dev' })
  expect(setView).toHaveBeenCalledWith('actual')
  expect(push).not.toHaveBeenCalled()
})

test('without a mock login (production Supabase) the preview only simulates', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    'https://fabxmporizzqflnftavs.supabase.co'
  render(<SignIn fullPage />)
  fireEvent.click(screen.getByRole('button', { name: /Sign in/ }))
  await waitFor(() => expect(setView).toHaveBeenCalledWith('signed-in'))
  expect(push).toHaveBeenCalledWith('/admin')
  expect(fetchMock).not.toHaveBeenCalled()
})

test('the login page keeps the real button while the preview simulates a session', () => {
  preview = { enabled: true, view: 'signed-in', setView }
  userMetadata = { user_name: 'preview_user' }
  render(<SignIn fullPage />)
  expect(
    screen.getByRole('button', { name: /Sign in as Alice Developer/ }),
  ).toBeInTheDocument()
})

test('elsewhere a simulated session hides the button', () => {
  preview = { enabled: true, view: 'signed-in', setView }
  userMetadata = { user_name: 'preview_user' }
  render(<SignIn />)
  expect(screen.queryByRole('button')).toBeNull()
})
