import { getAdminClient } from '@/app/admin/data'
import { loadDigestSubscribers } from '@/app/admin/digestSubscribersData'

jest.mock('@/app/admin/data', () => ({ getAdminClient: jest.fn() }))

const query = {
  select: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn(),
}
const from = jest.fn(() => query)

beforeEach(() => {
  jest.clearAllMocks()
  jest
    .mocked(getAdminClient)
    .mockResolvedValue({ from } as unknown as Awaited<
      ReturnType<typeof getAdminClient>
    >)
  query.range.mockResolvedValue({ data: [], count: 1001, error: null })
})

test('does not query subscriber addresses when the admin gate rejects access', async () => {
  jest.mocked(getAdminClient).mockRejectedValueOnce(new Error('Forbidden'))
  await expect(loadDigestSubscribers()).rejects.toThrow('Forbidden')
  expect(from).not.toHaveBeenCalled()
})

test('pages active subscribers beyond the PostgREST row cap without selecting tokens', async () => {
  const row = {
    id: 'last',
    email: 'reader@example.com',
    confirmed_at: '2026-09-15T10:00:00Z',
  }
  query.range.mockResolvedValueOnce({ data: [row], count: 1001, error: null })
  expect(await loadDigestSubscribers(21)).toEqual({
    rows: [row],
    total: 1001,
    page: 21,
  })
  expect(from).toHaveBeenCalledWith('digest_email_subscriptions')
  expect(query.select).toHaveBeenCalledWith('id, email, confirmed_at', {
    count: 'exact',
  })
  expect(query.not).toHaveBeenCalledWith('confirmed_at', 'is', null)
  expect(query.is).toHaveBeenCalledWith('unsubscribed_at', null)
  expect(query.order.mock.calls).toEqual([
    ['created_at', { ascending: false }],
    ['id', { ascending: true }],
  ])
  expect(query.range).toHaveBeenCalledWith(1000, 1049)
})

test.each([0, -1, 1.5, NaN, Infinity, 1_000_001])(
  'uses the first page for invalid page %s',
  async (page) => {
    expect((await loadDigestSubscribers(page)).page).toBe(1)
    expect(query.range).toHaveBeenCalledWith(0, 49)
  },
)

test('does not turn a query failure into an empty mailing list', async () => {
  query.range.mockResolvedValueOnce({
    data: null,
    count: null,
    error: new Error('Unavailable'),
  })
  await expect(loadDigestSubscribers()).rejects.toThrow('Unavailable')
})
