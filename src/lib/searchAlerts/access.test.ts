import { searchAlertsUser, canUseSearchAlerts } from './access'
import { getCurrentUser } from '@/lib/portal/auth'
import { isAdminUser } from '@/app/admin/data'

jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/app/admin/data', () => ({ isAdminUser: jest.fn() }))

test('signed-out requests get 401', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue(null)
  const result = await searchAlertsUser()
  expect(result.response?.status).toBe(401)
  expect(result.response?.headers.get('cache-control')).toBe(
    'private, no-store',
  )
  expect(await canUseSearchAlerts()).toBe(false)
})

test('signed-in accounts that are not admins get 403', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue({ id: 'u' } as never)
  jest.mocked(isAdminUser).mockReturnValue(false)
  expect((await searchAlertsUser()).response?.status).toBe(403)
})

test('admins get their user', async () => {
  jest.mocked(getCurrentUser).mockResolvedValue({ id: 'u' } as never)
  jest.mocked(isAdminUser).mockReturnValue(true)
  expect((await searchAlertsUser()).user?.id).toBe('u')
  expect(await canUseSearchAlerts()).toBe(true)
})
