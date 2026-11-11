/**
 * @jest-environment node
 */
import { checkIsAdmin, requireAdmin } from '@/app/admin/data'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { canViewSpreadExplorer, requireSpreadExplorerViewer } from './access'

jest.mock('server-only', () => ({}))
jest.mock('@/app/admin/data', () => ({
  checkIsAdmin: jest.fn(),
  requireAdmin: jest.fn(),
}))
jest.mock('@/lib/localAdminPreview', () => ({
  getLocalAdminPreview: jest.fn(),
}))

beforeEach(() => jest.resetAllMocks())

test('the localhost admin preview opens the explorer without a session', async () => {
  jest.mocked(getLocalAdminPreview).mockResolvedValue('admin')
  expect(await canViewSpreadExplorer()).toBe(true)
  await requireSpreadExplorerViewer()
  expect(checkIsAdmin).not.toHaveBeenCalled()
  expect(requireAdmin).not.toHaveBeenCalled()
})

test.each([null, 'signed-out'] as const)(
  'with preview %s the real admin gate decides',
  async (preview) => {
    jest.mocked(getLocalAdminPreview).mockResolvedValue(preview)
    jest.mocked(checkIsAdmin).mockResolvedValue(false)
    expect(await canViewSpreadExplorer()).toBe(false)
    await requireSpreadExplorerViewer()
    expect(requireAdmin).toHaveBeenCalledWith('/admin/spread-explorer')
  },
)
