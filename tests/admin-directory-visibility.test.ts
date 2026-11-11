import {
  hideDirectoryUser,
  listHiddenDirectoryUsers,
  restoreDirectoryUser,
} from '@/app/user-dir/actions'
import { requireAdmin } from '@/app/admin/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getUserDirectoryPage } from '@/lib/userDirectory'

jest.mock('@/app/admin/data', () => ({ requireAdmin: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/userDirectory', () => ({ getUserDirectoryPage: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const upsert = jest.fn().mockResolvedValue({ error: null })
const eq = jest.fn().mockResolvedValue({ error: null })
const from = jest.fn().mockReturnValue({ upsert, delete: () => ({ eq }) })
beforeEach(() => {
  jest.clearAllMocks()
  jest
    .mocked(requireAdmin)
    .mockResolvedValue({ user: { id: 'admin' } } as never)
  jest.mocked(createServerServiceRoleClient).mockReturnValue({ from } as never)
  jest.mocked(getUserDirectoryPage).mockResolvedValue({
    users: [
      {
        directory_id: 'id:42',
        account_id: '42',
        username: 'Bot',
      },
    ],
    hasMore: false,
  } as never)
})

test.each([
  () => hideDirectoryUser('id:42', 'Bot'),
  () => restoreDirectoryUser('id:42'),
  () => listHiddenDirectoryUsers(),
])('requires admin before accessing privileged data (%#)', async (action) => {
  jest.mocked(requireAdmin).mockRejectedValueOnce(new Error('forbidden'))
  await expect(action()).rejects.toThrow('forbidden')
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
  expect(getUserDirectoryPage).not.toHaveBeenCalled()
})

test('stores the resolved immutable identity and acting admin', async () => {
  await hideDirectoryUser('id:42', 'Bot')
  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      visibility_key: 'id:42',
      account_id: '42',
      username: 'bot',
      hidden_by: 'admin',
    }),
  )
  expect(createServerServiceRoleClient).toHaveBeenCalledWith({
    noStore: true,
    readSource: 'app',
  })
})

test('rejects mismatched submitted identities before writing', async () => {
  await expect(hideDirectoryUser('id:43', 'Bot')).rejects.toThrow(
    'Directory user not found',
  )
  expect(from).not.toHaveBeenCalled()
})

test('restores only the selected visibility record', async () => {
  await restoreDirectoryUser('id:42')
  expect(from).toHaveBeenCalledWith('directory_hidden_users')
  expect(eq).toHaveBeenCalledWith('visibility_key', 'id:42')
})
