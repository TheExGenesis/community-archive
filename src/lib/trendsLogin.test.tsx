import TrendsPage from '@/app/trends/page'
import { getIsMember } from '@/lib/portal/auth'
import {
  getCachedWeeklyTrends,
  getPortalTrendSnapshot,
  loadPortalComponentData,
} from '@/lib/portal/data'
import GuestTrends from '@/components/portal/GuestTrends'
jest.mock('@/lib/portal/auth', () => ({ getIsMember: jest.fn() }))
jest.mock('@/lib/portal/data', () => ({
  getCachedWeeklyTrends: jest.fn(),
  getPortalTrendSnapshot: jest.fn(),
  loadPortalComponentData: jest.fn(),
}))
jest.mock('@/components/portal/TrendsExplorer', () => () => null)
jest.mock('@/components/portal/GuestTrends', () => () => null)
jest.mock('@/components/portal/PortalComponentErrorBoundary', () => () => null)

test('previews cached terms instead of explorer reads before sign-in', async () => {
  jest.mocked(getIsMember).mockResolvedValue(false)
  jest
    .mocked(loadPortalComponentData)
    .mockResolvedValue({ data: [], failed: false })
  const page = await TrendsPage({
    searchParams: Promise.resolve({ q: 'art' }),
  })
  expect(page.type).toBe(GuestTrends)
  expect(jest.mocked(loadPortalComponentData).mock.calls[0][1]).toBe(
    getCachedWeeklyTrends,
  )
  expect(getPortalTrendSnapshot).not.toHaveBeenCalled()
})

test('renders the selected filters after sign-in', async () => {
  jest.mocked(getIsMember).mockResolvedValue(true)
  jest
    .mocked(loadPortalComponentData)
    .mockResolvedValue({ data: {}, failed: false })
  const page = await TrendsPage({
    searchParams: Promise.resolve({ q: 'art' }),
  })
  expect(page.props.children.props.initialSearch).toBe('q=art')
})
