import { loadRecentOptIns } from './recentOptInsData'
import { getAdminClient } from './data'
jest.mock('./data', () => ({ getAdminClient: jest.fn() }))
const getClient = getAdminClient as jest.Mock

function query(data: unknown[], error: unknown = null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data, error }),
  }
}
test('merges timestamped and legacy opt-ins in date order, excluding opt-outs', async () => {
  const dated = {
    id: 'a',
    username: 'alice',
    opted_in_at: '2026-09-06T10:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
  }
  const legacy = {
    id: 'b',
    username: 'bob',
    opted_in_at: null,
    created_at: '2026-09-07T10:00:00Z',
  }
  const queries = [query([dated]), query([legacy])]
  getClient.mockResolvedValue({
    from: jest
      .fn()
      .mockReturnValueOnce(queries[0])
      .mockReturnValueOnce(queries[1]),
  })
  expect(await loadRecentOptIns()).toEqual({
    optIns: [legacy, dated],
    failed: false,
  })
  for (const q of queries) {
    expect(q.eq).toHaveBeenCalledWith('opted_in', true)
    expect(q.or).toHaveBeenCalledWith(
      'explicit_optout.is.null,explicit_optout.eq.false',
    )
    expect(q.limit).toHaveBeenCalledWith(20)
  }
})
test('shows a failure instead of a partial or empty success', async () => {
  getClient.mockResolvedValue({ from: () => query([], { message: 'failed' }) })
  expect(await loadRecentOptIns()).toEqual({ optIns: [], failed: true })
})
test('requires admin before reading', async () => {
  getClient.mockRejectedValueOnce(new Error('Admin required'))
  await expect(loadRecentOptIns()).rejects.toThrow('Admin required')
})
