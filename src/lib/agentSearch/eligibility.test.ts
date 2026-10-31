const mockCookieGet = jest.fn()
const mockGetUser = jest.fn()
const mockUploadsResult = jest.fn()
const mockOptOutResult = jest.fn()
const mockUploadQuery = {
  select: jest.fn(),
  eq: jest.fn(),
}
const mockOptOutQuery = {
  select: jest.fn(),
  eq: jest.fn(),
  or: jest.fn(),
  limit: jest.fn(),
}
const mockSessionFrom = jest.fn()
const mockServiceFrom = jest.fn()

jest.mock('next/headers', () => ({
  cookies: () => ({ get: mockCookieGet }),
}))
jest.mock('@/utils/supabase', () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockSessionFrom,
  }),
  createServerServiceRoleClient: () => ({ from: mockServiceFrom }),
}))

import {
  agentSearchAccessStatus,
  getAgentSearchAccess,
  getAgentSearchViewer,
} from './eligibility'

const member = {
  id: '00000000-0000-0000-0000-000000000001',
  app_metadata: { provider_id: '42', user_name: 'Example_User' },
  user_metadata: { provider_id: '999' },
}

function signedIn(user: unknown) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null })
}

describe('getAgentSearchViewer', () => {
  const savedPreview = process.env.NEXT_PUBLIC_ENABLE_MEMBER_PREVIEW

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.NEXT_PUBLIC_ENABLE_MEMBER_PREVIEW
    mockCookieGet.mockReturnValue(undefined)

    // Each builder method returns the query; the terminal call resolves.
    mockUploadQuery.select.mockReturnValue(mockUploadQuery)
    let uploadEqCalls = 0
    mockUploadQuery.eq.mockImplementation(() =>
      ++uploadEqCalls % 2 === 0 ? mockUploadsResult() : mockUploadQuery,
    )
    mockOptOutQuery.select.mockReturnValue(mockOptOutQuery)
    mockOptOutQuery.eq.mockReturnValue(mockOptOutQuery)
    mockOptOutQuery.or.mockReturnValue(mockOptOutQuery)
    mockOptOutQuery.limit.mockImplementation(() => mockOptOutResult())
    mockSessionFrom.mockReturnValue(mockUploadQuery)
    mockServiceFrom.mockReturnValue(mockOptOutQuery)

    mockUploadsResult.mockResolvedValue({ count: 1, error: null })
    mockOptOutResult.mockResolvedValue({ data: [], error: null })
  })

  afterAll(() => {
    if (savedPreview === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_MEMBER_PREVIEW
    } else {
      process.env.NEXT_PUBLIC_ENABLE_MEMBER_PREVIEW = savedPreview
    }
  })

  test('treats the member preview cookie as the dev viewer', async () => {
    const env = process.env as Record<string, string | undefined>
    const savedNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'development'
    mockCookieGet.mockImplementation((name: string) =>
      name === 'dev_as_member' ? { value: '1' } : undefined,
    )

    await expect(getAgentSearchViewer()).resolves.toEqual({
      ok: true,
      viewer: { accountId: 'dev', userId: null, preview: true },
    })
    expect(mockGetUser).not.toHaveBeenCalled()
    env.NODE_ENV = savedNodeEnv
  })

  test('ignores the preview cookie on deployed previews', async () => {
    process.env.NEXT_PUBLIC_ENABLE_MEMBER_PREVIEW = 'true'
    mockCookieGet.mockReturnValue({ value: '1' })
    signedIn(null)

    await expect(getAgentSearchViewer()).resolves.toEqual({
      ok: false,
      reason: 'signed_out',
    })
  })

  test('ignores the preview cookie where preview is disabled', async () => {
    mockCookieGet.mockReturnValue({ value: '1' })
    signedIn(null)

    await expect(getAgentSearchViewer()).resolves.toEqual({
      ok: false,
      reason: 'signed_out',
    })
  })

  test('admits a member with a completed upload and no opt-out', async () => {
    signedIn(member)

    await expect(getAgentSearchViewer()).resolves.toEqual({
      ok: true,
      viewer: { accountId: '42', userId: member.id, preview: false },
    })
    expect(mockSessionFrom).toHaveBeenCalledWith('archive_upload')
    expect(mockUploadQuery.select).toHaveBeenCalledWith('id', {
      count: 'exact',
      head: true,
    })
    expect(mockUploadQuery.eq).toHaveBeenCalledWith('account_id', '42')
    expect(mockUploadQuery.eq).toHaveBeenCalledWith('upload_phase', 'completed')
    expect(mockServiceFrom).toHaveBeenCalledWith('optin')
    expect(mockOptOutQuery.eq).toHaveBeenCalledWith('explicit_optout', true)
    expect(mockOptOutQuery.or).toHaveBeenCalledWith(
      `user_id.eq.${member.id},twitter_user_id.eq.42,username.eq.example_user`,
    )
  })

  test('refuses a member without a completed upload', async () => {
    signedIn(member)
    mockUploadsResult.mockResolvedValue({ count: 0, error: null })

    await expect(getAgentSearchViewer()).resolves.toEqual({
      ok: false,
      reason: 'not_eligible',
    })
  })

  test('refuses a member who explicitly opted out', async () => {
    signedIn(member)
    mockOptOutResult.mockResolvedValue({ data: [{ id: 'x' }], error: null })

    await expect(getAgentSearchViewer()).resolves.toEqual({
      ok: false,
      reason: 'not_eligible',
    })
  })

  test('never takes the account id from user_metadata', async () => {
    signedIn({ ...member, app_metadata: {} })

    await expect(getAgentSearchViewer()).resolves.toEqual({
      ok: false,
      reason: 'not_eligible',
    })
    expect(mockSessionFrom).not.toHaveBeenCalled()
  })

  test('throws when a lookup fails instead of refusing the member', async () => {
    signedIn(member)
    mockOptOutResult.mockResolvedValue({
      data: null,
      error: { message: 'timeout' },
    })

    await expect(getAgentSearchViewer()).rejects.toThrow('Opt-out check failed')
  })

  test('routes see a failed lookup as unavailable, answered with 503', async () => {
    signedIn(member)
    mockUploadsResult.mockResolvedValue({ count: 1, error: null })
    mockOptOutResult.mockResolvedValue({
      data: null,
      error: { message: 'timeout' },
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const access = await getAgentSearchAccess()
    expect(access).toEqual({ ok: false, reason: 'unavailable' })
    expect(agentSearchAccessStatus('unavailable')).toBe(503)
    expect(agentSearchAccessStatus('signed_out')).toBe(401)
    expect(agentSearchAccessStatus('not_eligible')).toBe(403)
  })
})
