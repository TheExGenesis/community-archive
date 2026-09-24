import { DELETE, POST } from './route'
import { getCurrentUser } from '@/lib/portal/auth'
import { createServerServiceRoleClient } from '@/utils/supabase'

jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))

const mockUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>
const mockClient = createServerServiceRoleClient as jest.MockedFunction<
  typeof createServerServiceRoleClient
>
const projectId = '8c21b2b5-3530-4ec8-9729-07635b28b692'

function setup(project: { id: string; slug: string; status: string } | null) {
  const maybeSingle = jest
    .fn()
    .mockResolvedValue({ data: project, error: null })
  const projectEq = jest.fn().mockReturnValue({ maybeSingle })
  const upsert = jest.fn().mockResolvedValue({ error: null })
  const deleteUserEq = jest.fn().mockResolvedValue({ error: null })
  const deleteSlugEq = jest.fn().mockReturnValue({ eq: deleteUserEq })
  const remove = jest.fn().mockReturnValue({ eq: deleteSlugEq })
  const countEq = jest.fn().mockResolvedValue({ count: 3, error: null })
  const from = jest.fn((table: string) =>
    table === 'community_projects'
      ? { select: jest.fn().mockReturnValue({ eq: projectEq }) }
      : {
          select: jest.fn().mockReturnValue({ eq: countEq }),
          upsert,
          delete: remove,
        },
  )
  mockClient.mockReturnValue({ from } as never)
  return { projectEq, upsert, deleteSlugEq, deleteUserEq, countEq }
}

describe('community project likes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUser.mockResolvedValue({ id: 'user-123' } as never)
  })

  it('likes a catalog project before it has a database row', async () => {
    const db = setup(null)
    const response = await POST(new Request('http://localhost'), {
      params: { id: 'tpot-trust' },
    })

    expect(response.status).toBe(200)
    expect(db.upsert).toHaveBeenCalledWith(
      { project_slug: 'tpot-trust', project_id: null, user_id: 'user-123' },
      { onConflict: 'project_slug,user_id', ignoreDuplicates: true },
    )
    expect(db.countEq).toHaveBeenCalledWith('project_slug', 'tpot-trust')
    await expect(response.json()).resolves.toEqual({ liked: true, count: 3 })
  })

  it('accepts the existing UUID route and keeps the database association', async () => {
    const db = setup({
      id: projectId,
      slug: 'archive-quilt',
      status: 'published',
    })
    const response = await POST(new Request('http://localhost'), {
      params: { id: projectId },
    })

    expect(response.status).toBe(200)
    expect(db.projectEq).toHaveBeenCalledWith('id', projectId)
    expect(db.upsert).toHaveBeenCalledWith(
      {
        project_slug: 'archive-quilt',
        project_id: projectId,
        user_id: 'user-123',
      },
      { onConflict: 'project_slug,user_id', ignoreDuplicates: true },
    )
  })

  it('unlikes a catalog project by slug', async () => {
    const db = setup(null)
    const response = await DELETE(new Request('http://localhost'), {
      params: { id: 'tpot-trust' },
    })

    expect(response.status).toBe(200)
    expect(db.deleteSlugEq).toHaveBeenCalledWith('project_slug', 'tpot-trust')
    expect(db.deleteUserEq).toHaveBeenCalledWith('user_id', 'user-123')
  })

  it('rejects unknown catalog slugs', async () => {
    setup(null)
    const response = await POST(new Request('http://localhost'), {
      params: { id: 'unknown-project' },
    })
    expect(response.status).toBe(404)
  })
})
