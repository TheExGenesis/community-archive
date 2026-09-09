import type { User } from '@supabase/supabase-js'
import { loadOpportunities, loadRunDashboard } from './data'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { getCurrentUser } from '@/lib/portal/auth'
import { getAdminClient } from '@/app/admin/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
jest.mock('@/lib/localAdminPreview', () => ({
  getLocalAdminPreview: jest.fn(),
}))
jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/app/admin/data', () => ({ getAdminClient: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))
const rpc = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getLocalAdminPreview).mockResolvedValue(null)
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ rpc } as unknown as ReturnType<
      typeof createServerServiceRoleClient
    >)
})
test.each([null, { is_anonymous: true }])(
  'signed-out/anonymous visitors never reach private data',
  async (user) => {
    jest.mocked(getCurrentUser).mockResolvedValue(user as User | null)
    await expect(loadOpportunities()).rejects.toThrow(
      'redirect:/login?redirect=/opportunities',
    )
    expect(createServerServiceRoleClient).not.toHaveBeenCalled()
  },
)
test('verified members read the policy-aware RPC, with upstream errors kept distinct from empty results', async () => {
  jest
    .mocked(getCurrentUser)
    .mockResolvedValue({ id: 'member', is_anonymous: false } as User)
  rpc
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: null, error: { message: 'unavailable' } })
  await expect(loadOpportunities()).resolves.toEqual([])
  expect(rpc).toHaveBeenCalledWith('get_bulletin_opportunities', {
    max_results: 200,
  })
  await expect(loadOpportunities()).rejects.toThrow('could not be loaded')
})
test('run history always requires admin authorization', async () => {
  jest.mocked(getAdminClient).mockRejectedValueOnce(new Error('not authorized'))
  await expect(loadRunDashboard()).rejects.toThrow('not authorized')
  expect(rpc).not.toHaveBeenCalled()
})
test('run history uses bounded keyset pagination and rejects malformed cursors', async () => {
  jest
    .mocked(getAdminClient)
    .mockResolvedValue({ rpc } as unknown as Awaited<
      ReturnType<typeof getAdminClient>
    >)
  rpc.mockResolvedValue({
    data: {
      runs: [],
      queue: { pending: 0, retrying: 0, exhausted: 0 },
      last_success_at: null,
    },
    error: null,
  })
  await loadRunDashboard('25')
  expect(rpc).toHaveBeenCalledWith('get_bulletin_runs', {
    before_id: 25,
    max_results: 26,
  })
  rpc.mockClear()
  for (const value of ['-1', '1 OR 1=1', '9e3', '9007199254740993'])
    await expect(loadRunDashboard(value)).rejects.toThrow('Invalid run cursor')
  expect(rpc).not.toHaveBeenCalled()
})

test('explicit local admin read preview does not fabricate an Auth user', async () => {
  jest.mocked(getLocalAdminPreview).mockResolvedValue('admin')
  rpc.mockResolvedValue({ data: [], error: null })
  await expect(loadOpportunities()).resolves.toEqual([])
  expect(getCurrentUser).not.toHaveBeenCalled()
})
test('signed-out local preview still requires login', async () => {
  jest.mocked(getLocalAdminPreview).mockResolvedValue('signed-out')
  jest.mocked(getCurrentUser).mockResolvedValue(null)
  await expect(loadOpportunities()).rejects.toThrow('redirect:/login')
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})
