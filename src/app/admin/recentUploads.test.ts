import { loadRecentArchiveUploads } from './recentUploads'
import { getAdminClient } from './data'
jest.mock('./data', () => ({ getAdminClient: jest.fn() }))
const getClient = getAdminClient as jest.Mock

test('reads a bounded, deterministic upload history without deduplicating accounts', async () => {
  const uploads = [
    { id: 2, account_id: '42' },
    { id: 1, account_id: '42' },
  ]
  const query = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: uploads, error: null }),
  }
  const from = jest.fn(() => query)
  getClient.mockResolvedValue({ from })
  expect(await loadRecentArchiveUploads()).toEqual({ uploads, failed: false })
  expect(from).toHaveBeenCalledWith('archive_upload')
  expect(query.order.mock.calls).toEqual([
    ['created_at', { ascending: false, nullsFirst: false }],
    ['id', { ascending: false }],
  ])
  expect(query.limit).toHaveBeenCalledWith(20)
})

test('keeps the admin identity gate outside error-to-empty handling', async () => {
  getClient.mockRejectedValueOnce(new Error('Admin required'))
  await expect(loadRecentArchiveUploads()).rejects.toThrow('Admin required')
})
