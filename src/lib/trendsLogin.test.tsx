import TrendsPage from '@/app/trends/page'
import { getIsMember } from '@/lib/portal/auth'
import { loadPortalComponentData } from '@/lib/portal/data'
import { redirect } from 'next/navigation'
jest.mock('next/navigation', () => ({
  redirect: jest.fn((href: string) => {
    throw new Error(href)
  }),
}))
jest.mock('@/lib/portal/auth', () => ({ getIsMember: jest.fn() }))
jest.mock('@/lib/portal/data', () => ({
  getPortalTrendSnapshot: jest.fn(),
  loadPortalComponentData: jest.fn(),
}))
jest.mock('@/components/portal/TrendsExplorer', () => () => null)
jest.mock('@/components/portal/PortalComponentErrorBoundary', () => () => null)

test('preserves repeated Trends filters and gates reads before sign-in', async () => {
  jest.mocked(getIsMember).mockResolvedValue(false)
  const searchParams = { q: ['AI agents', 'art'], granularity: 'month' }
  await expect(TrendsPage({ searchParams })).rejects.toThrow('/login?redirect=')
  const href = new URL(
    jest.mocked(redirect).mock.calls[0][0],
    'https://community-archive.org',
  )
  const destination = new URL(href.searchParams.get('redirect')!, href.origin)
  expect(destination.pathname).toBe('/trends')
  expect(destination.searchParams.getAll('q')).toEqual(searchParams.q)
  expect(destination.searchParams.get('granularity')).toBe('month')
  expect(loadPortalComponentData).not.toHaveBeenCalled()
})

test('renders the selected filters after sign-in', async () => {
  jest.mocked(getIsMember).mockResolvedValue(true)
  jest
    .mocked(loadPortalComponentData)
    .mockResolvedValue({ data: {}, failed: false })
  const page = await TrendsPage({ searchParams: { q: 'art' } })
  expect(page.props.children.props.initialSearch).toBe('q=art')
})
