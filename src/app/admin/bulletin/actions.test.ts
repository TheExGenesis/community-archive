import { savePrompt } from './actions'
import { requireAdmin } from '@/app/admin/data'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { createServerServiceRoleClient } from '@/utils/supabase'

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/app/admin/data', () => ({ requireAdmin: jest.fn() }))
jest.mock('@/lib/localAdminPreview', () => ({
  getLocalAdminPreview: jest.fn(),
}))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
const rpc = jest.fn()
function form(body = 'New prompt') {
  const data = new FormData()
  data.set('body', body)
  data.set('note', 'Stricter criteria')
  data.set('expected_id', '1')
  data.set('actor_id', 'forged')
  return data
}
beforeEach(() => {
  jest.resetAllMocks()
  jest
    .mocked(requireAdmin)
    .mockResolvedValue({ user: { id: 'verified-admin' } } as Awaited<
      ReturnType<typeof requireAdmin>
    >)
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ rpc } as unknown as ReturnType<
      typeof createServerServiceRoleClient
    >)
  rpc.mockResolvedValue({ data: '2', error: null })
})
test('authorization precedes writes and cannot be bypassed by calling the action directly', async () => {
  jest.mocked(requireAdmin).mockRejectedValue(new Error('not admin'))
  await expect(savePrompt(form())).rejects.toThrow('not admin')
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})
test('local read preview cannot mutate production', async () => {
  jest.mocked(getLocalAdminPreview).mockResolvedValue('admin')
  expect(await savePrompt(form())).toEqual({
    error: expect.stringContaining('read-only'),
  })
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})
test('uses verified actor, exact prompt and expected version', async () => {
  expect(await savePrompt(form('  New prompt\n'))).toEqual({ version: '2' })
  expect(rpc).toHaveBeenCalledWith('save_bulletin_prompt', {
    expected_id: 1,
    prompt_body: '  New prompt\n',
    change_note: 'Stricter criteria',
    actor_id: 'verified-admin',
  })
})
test('validates bytes and refuses malformed versions before any write', async () => {
  expect(await savePrompt(form('😀'.repeat(4001)))).toHaveProperty('error')
  const malformed = form()
  malformed.set('expected_id', '1e3')
  expect(await savePrompt(malformed)).toHaveProperty('error')
  expect(rpc).not.toHaveBeenCalled()
})
test('conflicting edit gives recovery guidance without provider error leakage', async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { code: '40001', message: 'private internal details' },
  })
  expect(await savePrompt(form())).toEqual({
    error: expect.stringContaining('Another edit'),
  })
})
