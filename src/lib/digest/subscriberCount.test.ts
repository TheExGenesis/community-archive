import { getActiveDigestSubscriberCount } from './emailSubscriptions'
import { createServerServiceRoleClient } from '@/utils/supabase'

jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))

const query = {
  select: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  eq: jest.fn(),
}

beforeEach(() => {
  jest.clearAllMocks()
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ from: () => query } as unknown as ReturnType<
      typeof createServerServiceRoleClient
    >)
})

test('returns an exact active count beyond the row cap without retrieving private rows', async () => {
  query.eq.mockResolvedValueOnce({ data: null, count: 1234, error: null })
  expect(await getActiveDigestSubscriberCount()).toBe(1234)
  expect(query.select).toHaveBeenCalledWith('id', {
    count: 'exact',
    head: true,
  })
  expect(query.not).toHaveBeenCalledWith('confirmed_at', 'is', null)
  expect(query.is).toHaveBeenCalledWith('unsubscribed_at', null)
  expect(query.eq).toHaveBeenCalledWith('daily_enabled', true)
})

test('counts the weekly list separately', async () => {
  query.eq.mockResolvedValueOnce({ count: 7, error: null })
  expect(await getActiveDigestSubscriberCount('weekly')).toBe(7)
  expect(query.eq).toHaveBeenCalledWith('weekly_enabled', true)
})

test('keeps a genuine zero count', async () => {
  query.eq.mockResolvedValueOnce({ count: 0, error: null })
  expect(await getActiveDigestSubscriberCount()).toBe(0)
})

test.each([
  { count: null, error: null },
  { count: null, error: new Error('Unavailable') },
])('rejects unavailable counts rather than returning zero', async (result) => {
  query.eq.mockResolvedValueOnce(result)
  await expect(getActiveDigestSubscriberCount()).rejects.toThrow()
})
