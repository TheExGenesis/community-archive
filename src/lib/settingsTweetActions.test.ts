import { getOwnLatestTweets } from '@/app/settings/tweet-actions'
import { requireAuth } from '@/lib/auth-utils'
jest.mock('@/lib/auth-utils', () => ({ requireAuth: jest.fn() }))
test('scopes the bounded read to the verified account, ignoring mutable user metadata', async () => {
  const limit = jest.fn().mockResolvedValue({ data: [], error: null })
  const order = jest.fn(() => ({ limit }))
  const eq = jest.fn(() => ({ order }))
  const from = jest.fn(() => ({ select: jest.fn(() => ({ eq })) }))
  ;(requireAuth as jest.Mock).mockResolvedValue({
    user: {
      app_metadata: { provider_id: '42' },
      user_metadata: { provider_id: '99' },
    },
    supabase: { from },
  })
  await getOwnLatestTweets()
  expect(eq).toHaveBeenCalledWith('account_id', '42')
  expect(limit).toHaveBeenCalledWith(100)
  ;(requireAuth as jest.Mock).mockResolvedValue({
    user: { app_metadata: {}, user_metadata: { provider_id: '99' } },
    supabase: { from },
  })
  await expect(getOwnLatestTweets()).rejects.toThrow('could not be verified')
  expect(from).toHaveBeenCalledTimes(1)
})
