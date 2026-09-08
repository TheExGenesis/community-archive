import { loadActivityPageAction } from '@/app/admin/activityFeedActions'
import { getAdminClient } from '@/app/admin/data'

jest.mock('@/app/admin/data', () => ({ getAdminClient: jest.fn() }))
const gate = getAdminClient as jest.Mock
const rpc = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  gate.mockResolvedValue({ rpc })
})

test('gates pagination before database access', async () => {
  gate.mockRejectedValue(new Error('Admin required'))
  await expect(loadActivityPageAction({})).rejects.toThrow('Admin required')
  expect(rpc).not.toHaveBeenCalled()
})
test('uses one extra row and preserves the exact timestamp in the cursor', async () => {
  const rows = Array.from({ length: 26 }, (_, i) => ({
    id: `upload:${i}`,
    occurred_at: '2026-09-01T12:00:00.123456+00:00',
  }))
  rpc.mockResolvedValue({ data: rows, error: null })
  const result = await loadActivityPageAction({
    search: ' @alice ',
    kind: 'opt_out',
  })
  expect(result.events).toHaveLength(25)
  expect(result.nextCursor).toEqual(rows[24])
  expect(rpc).toHaveBeenCalledWith(
    'admin_activity_page',
    expect.objectContaining({
      p_search: '@alice',
      p_kind: 'opt_out',
      p_limit: 26,
    }),
  )
  rpc.mockResolvedValue({ data: [], error: null })
  expect(await loadActivityPageAction({ cursor: result.nextCursor })).toEqual({
    events: [],
    nextCursor: null,
  })
  expect(rpc).toHaveBeenLastCalledWith(
    'admin_activity_page',
    expect.objectContaining({
      p_before_id: 'upload:24',
      p_before_at: '2026-09-01T12:00:00.123456+00:00',
    }),
  )
})
test('supports unknown-date cursors and rejects malformed filters', async () => {
  rpc.mockResolvedValue({ data: [], error: null })
  await loadActivityPageAction({
    cursor: { id: 'optout:123', occurred_at: null },
  })
  expect(rpc).toHaveBeenCalledWith(
    'admin_activity_page',
    expect.objectContaining({
      p_before_id: 'optout:123',
      p_before_at: undefined,
    }),
  )
  rpc.mockClear()
  for (const input of [
    { kind: 'anything' },
    { search: 'a'.repeat(65) },
    { cursor: { id: 'bad),x', occurred_at: 'yesterday' } },
  ]) {
    await expect(loadActivityPageAction(input)).rejects.toThrow()
  }
  expect(rpc).not.toHaveBeenCalled()
})
test('does not turn an upstream error into an empty success', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  rpc.mockResolvedValue({ data: null, error: { message: 'missing function' } })
  await expect(loadActivityPageAction({})).rejects.toThrow(
    'Activity could not be loaded',
  )
  log.mockRestore()
})
