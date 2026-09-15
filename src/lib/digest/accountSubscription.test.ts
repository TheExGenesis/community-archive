import { getSubscriptionForAccount } from './emailSubscriptions'
import { createServerServiceRoleClient } from '@/utils/supabase'

jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))

test('constrains a chosen subscription to the authenticated account and prefers active subscriptions', async () => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ from: () => query } as unknown as ReturnType<
      typeof createServerServiceRoleClient
    >)
  expect(
    await getSubscriptionForAccount('trusted-account', 'chosen-subscription'),
  ).toBeNull()
  expect(query.eq.mock.calls).toEqual([
    ['account_id', 'trusted-account'],
    ['id', 'chosen-subscription'],
  ])
  expect(query.order).toHaveBeenNthCalledWith(1, 'unsubscribed_at', {
    ascending: true,
    nullsFirst: true,
  })
})
