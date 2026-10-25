import { getRecentMemberCount } from './recentMembers'
import { createServerServiceRoleClient } from '@/utils/supabase'
jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
it('counts the rolling join window and does not interpret failures as zero', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-24T12:00:00Z'))
  const lte = jest.fn().mockResolvedValue({ count: 0, error: null })
  const gte = jest.fn(() => ({ lte }))
  const select = jest.fn(() => ({ gte }))
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ from: () => ({ select }) } as never)
  try {
    expect(await getRecentMemberCount()).toBe(0)
    expect(select).toHaveBeenCalledWith('*', { count: 'exact', head: true })
    expect(gte).toHaveBeenCalledWith('joined_at', '2026-10-23T12:00:00.000Z')
    expect(lte).toHaveBeenCalledWith('joined_at', '2026-10-24T12:00:00.000Z')
    lte.mockResolvedValue({
      count: null,
      error: { message: 'offline' },
    } as never)
    await expect(getRecentMemberCount()).rejects.toThrow(
      'Recent members unavailable',
    )
  } finally {
    jest.useRealTimers()
  }
})
