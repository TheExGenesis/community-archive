import BangersPage from '@/app/bangers/page'
import { getInitialPortalBangersPage } from '@/lib/portal/data'
jest.mock('@/lib/portal/data', () => ({
  getInitialPortalBangersPage: jest.fn(),
}))
jest.mock('@/components/portal/BangersExplorer', () => ({
  BangersExplorer: () => null,
}))
jest.mock('@/components/PagePerformance', () => ({ SectionReady: () => null }))
const load = jest.mocked(getInitialPortalBangersPage)
beforeEach(() => load.mockClear())
test.each([
  [{}, { period: 'week' }],
  [{ period: 'nonsense' }, { period: 'week' }],
  [{ year: '2024' }, { year: 2024 }],
  [{ period: 'all' }, { year: undefined }],
  [{ period: 'all', year: '2024' }, { year: undefined }],
  [{ period: 'today', year: '2024' }, { period: 'today' }],
])('resolves the page time selection %j', (searchParams, expected) => {
  BangersPage({ searchParams })
  expect(load).toHaveBeenCalledWith({
    scope: 'all',
    sort: 'quotes',
    query: '',
    ...expected,
  })
})
