import { getRefreshState, requestRefresh } from './refreshActions'
import { requireAdmin } from '@/app/admin/data'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { createServerServiceRoleClient } from '@/utils/supabase'

jest.mock('@/app/admin/data', () => ({ requireAdmin: jest.fn() }))
jest.mock('@/lib/localAdminPreview', () => ({
  getLocalAdminPreview: jest.fn(),
}))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
const rpc = jest.fn()
const id = '00000000-0000-4000-8000-000000000001'
const originalEnabled = process.env.BULLETIN_REFRESH_ENABLED
function form() {
  const data = new FormData()
  Object.entries({
    selection: 'two_weeks',
    prompt_id: '2',
    budget: '0.10',
    request_id: id,
    actor_id: 'forged',
  }).forEach(([key, value]) => data.set(key, value))
  return data
}
beforeEach(() => {
  jest.resetAllMocks()
  process.env.BULLETIN_REFRESH_ENABLED = 'true'
  jest
    .mocked(requireAdmin)
    .mockResolvedValue({ user: { id: 'verified' } } as Awaited<
      ReturnType<typeof requireAdmin>
    >)
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ rpc } as unknown as ReturnType<
      typeof createServerServiceRoleClient
    >)
  rpc.mockResolvedValue({ data: id, error: null })
})
afterAll(() => {
  if (originalEnabled === undefined) delete process.env.BULLETIN_REFRESH_ENABLED
  else process.env.BULLETIN_REFRESH_ENABLED = originalEnabled
})
test('gates both submission and status on verified admin auth', async () => {
  jest.mocked(requireAdmin).mockRejectedValue(new Error('not admin'))
  await expect(requestRefresh(form())).rejects.toThrow('not admin')
  await expect(getRefreshState()).rejects.toThrow('not admin')
  expect(rpc).not.toHaveBeenCalled()
})
test('disabled rollout and read preview cannot queue work', async () => {
  process.env.BULLETIN_REFRESH_ENABLED = 'false'
  expect(await requestRefresh(form())).toHaveProperty('error')
  process.env.BULLETIN_REFRESH_ENABLED = 'true'
  jest.mocked(getLocalAdminPreview).mockResolvedValue('admin')
  expect(await requestRefresh(form())).toHaveProperty('error')
  expect(rpc).not.toHaveBeenCalled()
})
test('pins expected prompt and uses verified actor and idempotency key', async () => {
  expect(await requestRefresh(form())).toEqual({ id })
  expect(rpc).toHaveBeenCalledWith('request_bulletin_refresh', {
    request_id: id,
    selection: 'two_weeks',
    expected_prompt_id: 2,
    budget_usd: 0.1,
    actor_id: 'verified',
  })
})
test.each([
  ['selection', 'all'],
  ['budget', '1.01'],
  ['budget', 'NaN'],
  ['budget', '0'],
  ['prompt_id', '2e1'],
  ['request_id', 'invalid'],
])('rejects invalid %s', async (key, value) => {
  const data = form()
  data.set(key, value)
  expect(await requestRefresh(data)).toHaveProperty('error')
  expect(rpc).not.toHaveBeenCalled()
})
test('conflicts surface a useful error without internal details', async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { code: '40001', message: 'private' },
  })
  expect(await requestRefresh(form())).toEqual({
    error: expect.stringContaining('saved prompt changed'),
  })
})
