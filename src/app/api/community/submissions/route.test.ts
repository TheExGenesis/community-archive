import { POST } from './route'
import { getCurrentUser } from '@/lib/portal/auth'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import { createServerServiceRoleClient } from '@/utils/supabase'

jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/lib/sessionTwitterUsername', () => ({
  getSessionTwitterUsername: jest.fn(),
}))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>
const mockGetSessionTwitterUsername =
  getSessionTwitterUsername as jest.MockedFunction<
    typeof getSessionTwitterUsername
  >
const mockCreateServiceRole =
  createServerServiceRoleClient as jest.MockedFunction<
    typeof createServerServiceRoleClient
  >

const submissionRequest = () => {
  const formData = new FormData()
  formData.set('projectName', 'Archive Quilt')
  formData.set('projectUrl', 'https://example.org/archive-quilt')
  formData.set('creatorName', 'Ada')
  formData.set('category', 'Experiments')
  formData.set('description', 'A visual map of recurring conversations.')
  formData.set(
    'archiveUse',
    'It groups public posts into visual conversation clusters.',
  )
  formData.set('sourcePost', 'https://x.com/ada/status/1234567890')
  return new Request('http://localhost/api/community/submissions', {
    method: 'POST',
    body: formData,
  })
}

describe('community submission API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('requires a signed-in user', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    const response = await POST(submissionRequest())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Sign in before submitting a project.',
    })
    expect(mockCreateServiceRole).not.toHaveBeenCalled()
  })

  it('stores valid submissions as pending', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null })
    const from = jest.fn(() => ({ insert }))
    mockGetCurrentUser.mockResolvedValue({ id: 'user-123' } as never)
    mockGetSessionTwitterUsername.mockReturnValue('ada')
    mockCreateServiceRole.mockReturnValue({ from } as never)

    const response = await POST(submissionRequest())

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: expect.any(String),
    })
    expect(from).toHaveBeenCalledWith('community_projects')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Archive Quilt',
        submitted_by: 'user-123',
        submitter_username: 'ada',
        status: 'pending',
      }),
    )
  })
})
