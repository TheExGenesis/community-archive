import StreamPage, { dynamic as streamRenderingMode } from '@/app/stream/page'
import { startStreamData } from '@/lib/portal/data'
import { getIsMember, getCurrentUser } from '@/lib/portal/auth'

jest.mock('@/lib/portal/data', () => ({ startStreamData: jest.fn() }))
jest.mock('@/lib/portal/auth', () => ({
  getIsMember: jest.fn(),
  getCurrentUser: jest.fn(),
}))

test('renders at request time so portal fallback data is not frozen at build time', () => {
  expect(streamRenderingMode).toBe('force-dynamic')
})

test('renders the public stream without a membership check', () => {
  const pending = new Promise<never>(() => {})
  jest
    .mocked(startStreamData)
    .mockReturnValue({ tweets: pending, stats: pending })
  const page = StreamPage()
  expect(page.type).toBe('main')
  expect(startStreamData).toHaveBeenCalledTimes(1)
  expect(getIsMember).not.toHaveBeenCalled()
  expect(getCurrentUser).not.toHaveBeenCalled()
})
