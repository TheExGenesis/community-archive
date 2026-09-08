import {
  approveCommunityProject,
  editCommunityProject,
  deleteCommunityProject,
} from '@/app/admin/communitySubmissionActions'
import { requireAdmin } from '@/app/admin/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
jest.mock('@/app/admin/data', () => ({ requireAdmin: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const id = '8c21b2b5-3530-4ec8-9729-07635b28b692'
const form = () => {
  const data = new FormData()
  Object.entries({
    projectId: id,
    projectName: 'Quilt',
    projectUrl: 'https://example.org',
    creatorName: 'Ada',
    creatorHandle: 'ada',
    category: 'Experiments',
    description: 'Conversation map',
    archiveUse: 'Groups public archive posts',
    sourcePost: 'https://x.com/ada/status/123',
    tags: 'maps',
  }).forEach(([key, value]) => data.set(key, value))
  return data
}
const query = {
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(),
}
beforeEach(() => {
  jest.clearAllMocks()
  jest
    .mocked(requireAdmin)
    .mockResolvedValue({ user: { id: 'admin' } } as Awaited<
      ReturnType<typeof requireAdmin>
    >)
  jest
    .mocked(createServerServiceRoleClient)
    .mockReturnValue({ from: () => query } as unknown as ReturnType<
      typeof createServerServiceRoleClient
    >)
  query.maybeSingle.mockResolvedValue({ data: { id }, error: null })
})
test.each([
  approveCommunityProject,
  editCommunityProject,
  deleteCommunityProject,
])('gates mutations before creating an elevated client', async (action) => {
  jest.mocked(requireAdmin).mockRejectedValueOnce(new Error('Forbidden'))
  await expect(action(form())).rejects.toThrow('Forbidden')
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
})
test.each([
  approveCommunityProject,
  editCommunityProject,
  deleteCommunityProject,
])(
  'only changes the matching pending submission and reports concurrent removal',
  async (action) => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await action(form())).toMatchObject({ ok: false })
    expect(query.eq.mock.calls).toEqual([
      ['id', id],
      ['status', 'pending'],
    ])
  },
)
test('validates edits and only writes editable fields', async () => {
  const data = form()
  data.set('projectUrl', 'javascript:alert(1)')
  expect(await editCommunityProject(data)).toMatchObject({ ok: false })
  expect(createServerServiceRoleClient).not.toHaveBeenCalled()
  data.set('projectUrl', 'https://example.org')
  data.set('status', 'published')
  expect(await editCommunityProject(data)).toEqual({ ok: true, projectId: id })
  expect(query.update).toHaveBeenCalledWith({
    name: 'Quilt',
    project_url: 'https://example.org/',
    creator_name: 'Ada',
    creator_handle: 'ada',
    category: 'Experiments',
    description: 'Conversation map',
    archive_use: 'Groups public archive posts',
    source_post_url: 'https://x.com/ada/status/123',
    tags: ['maps'],
  })
})
