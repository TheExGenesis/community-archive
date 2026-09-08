import { getBirdseyeSourceIndex } from './birdseye-source-index'
import { isAdminUser } from '@/app/admin/data'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import {
  createServerClient,
  createServerServiceRoleClient,
} from '@/utils/supabase'
import { getAppDataManifest, getAppPolicy, getBirdseyeAnalysis } from './data'
import {
  createBirdseyeShare,
  getBirdseyeProfiles,
  loadAccessibleBirdseye,
  resolveBirdseyeShare,
  SHARE_COOKIE,
} from './birdseye-access'
import { GET as sources } from '@/app/api/birdseye/sources/route'
import { POST, DELETE } from '@/app/api/birdseye/sharing/route'
import { getSourceTweets } from './source-tweets'
import { NextRequest } from 'next/server'
jest.mock('@/app/admin/data', () => ({ isAdminUser: jest.fn() }))
jest.mock('@/lib/localAdminPreview', () => ({
  getLocalAdminPreview: jest.fn(),
}))
jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('next/cache', () => ({ unstable_noStore: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerClient: jest.fn(),
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('./data', () => ({
  getAppDataManifest: jest.fn(),
  getAppPolicy: jest.fn(),
  getBirdseyeAnalysis: jest.fn(),
}))
jest.mock('./birdseye-source-index', () => ({
  getBirdseyeSourceIndex: jest.fn(),
}))
jest.mock('./source-tweets', () => ({ getSourceTweets: jest.fn() }))
const owner = {
  id: '12345678-1234-1234-1234-123456789abc',
  app_metadata: { provider_id: '123' },
  identities: [{ provider: 'twitter', identity_data: { user_name: 'alice' } }],
} as unknown as User
let session: User | null
let stored: User
let cookie: string | undefined
const updateUserById = jest.fn()
const getUserById = jest.fn()
const member = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  jest
    .mocked(getBirdseyeSourceIndex)
    .mockImplementation(async (ids) => ids.map((id) => ({ id, threadId: id })))
  jest.mocked(isAdminUser).mockReturnValue(false)
  jest.mocked(getLocalAdminPreview).mockResolvedValue(null)
  session = null
  stored = structuredClone(owner)
  cookie = undefined
  jest.mocked(cookies).mockImplementation(
    () =>
      ({
        get: (name: string) =>
          name === SHARE_COOKIE && cookie ? { value: cookie } : undefined,
      }) as never,
  )
  jest.mocked(createServerClient).mockReturnValue({
    auth: { getUser: async () => ({ data: { user: session }, error: null }) },
  } as never)
  getUserById.mockImplementation(async () => ({
    data: { user: stored },
    error: null,
  }))
  updateUserById.mockImplementation(async (_id, attributes) => {
    stored.app_metadata = { ...stored.app_metadata, ...attributes.app_metadata }
    return { error: null }
  })
  member.mockResolvedValue({ data: { username: 'alice' }, error: null })
  jest.mocked(createServerServiceRoleClient).mockReturnValue({
    auth: { admin: { getUserById, updateUserById } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: member }) }) }),
  } as never)
  jest.mocked(getAppPolicy).mockResolvedValue({
    members: new Set(['alice']),
    blocked: new Set(),
    blockedIds: new Set(),
  })
  jest
    .mocked(getAppDataManifest)
    .mockResolvedValue({ birdseye: [{ username: 'alice' }] } as never)
  jest.mocked(getBirdseyeAnalysis).mockResolvedValue({
    username: 'alice',
    groups: [],
    clusters: [
      {
        id: 'topic',
        tweetIds: Array.from({ length: 14 }, (_, i) => String(i + 1)),
      },
    ],
  } as never)
  jest.mocked(getSourceTweets).mockResolvedValue(new Map())
})
test('private by default: anonymous, another owner, and user-editable metadata cannot read analysis or sources', async () => {
  expect(await loadAccessibleBirdseye('alice')).toBeNull()
  session = {
    ...owner,
    identities: [],
    user_metadata: { user_name: 'alice', provider_id: '123' },
  }
  expect(await loadAccessibleBirdseye('alice')).toBeNull()
  session = {
    ...owner,
    identities: [{ provider: 'twitter', identity_data: { user_name: 'bob' } }],
  } as unknown as User
  expect(await loadAccessibleBirdseye('alice')).toBeNull()
  expect(
    (
      await sources(
        new NextRequest(
          'https://ca.test/api/birdseye/sources?username=alice&cluster_id=topic',
        ),
      )
    ).status,
  ).toBe(404)
  expect(getBirdseyeAnalysis).not.toHaveBeenCalled()
  expect(getSourceTweets).not.toHaveBeenCalled()
  expect(getBirdseyeSourceIndex).not.toHaveBeenCalled()
})
test('owner identity and matching account are required, with consent rechecked on every read', async () => {
  session = owner
  expect(await loadAccessibleBirdseye()).toMatchObject({
    isOwner: true,
    sharingEnabled: false,
  })
  member.mockResolvedValue({ data: { username: 'bob' }, error: null })
  expect(await loadAccessibleBirdseye()).toBeNull()
  member.mockResolvedValue({ data: { username: 'alice' }, error: null })
  jest.mocked(getAppPolicy).mockResolvedValue({
    members: new Set(),
    blocked: new Set(['alice']),
    blockedIds: new Set(['123']),
  })
  expect(await loadAccessibleBirdseye()).toBeNull()
})
test('only the opaque share secret grants access; rotation, revocation, and identity changes invalidate existing cookies', async () => {
  const share = createBirdseyeShare(owner)
  stored.app_metadata.birdseye_share = share.setting
  cookie = share.token
  expect(await loadAccessibleBirdseye('alice')).toMatchObject({
    isOwner: false,
  })
  expect(await loadAccessibleBirdseye('bob')).toBeNull()
  expect(await resolveBirdseyeShare(`${owner.id}.${'0'.repeat(64)}`)).toBeNull()
  expect(JSON.stringify(share.setting)).not.toContain(share.token.split('.')[1])
  stored.app_metadata.birdseye_share = createBirdseyeShare(owner).setting
  expect(await loadAccessibleBirdseye('alice')).toBeNull()
  stored.app_metadata.birdseye_share = null
  expect(await loadAccessibleBirdseye('alice')).toBeNull()
  stored.app_metadata.birdseye_share = share.setting
  stored.app_metadata.provider_id = '456'
  expect(await resolveBirdseyeShare(share.token)).toBeNull()
})
test('source pagination selects only this authorized topic and bounds each read to six records', async () => {
  session = owner
  const response = await sources(
    new NextRequest(
      'https://ca.test/api/birdseye/sources?username=alice&cluster_id=topic&offset=6&ids=999',
    ),
  )
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(getSourceTweets).toHaveBeenCalledWith([
    '7',
    '8',
    '9',
    '10',
    '11',
    '12',
  ])
  expect(await response.json()).toMatchObject({ nextOffset: 12 })
  expect(
    (
      await sources(
        new NextRequest(
          'https://ca.test/api/birdseye/sources?username=alice&cluster_id=hidden',
        ),
      )
    ).status,
  ).toBe(404)
  expect(
    (
      await sources(
        new NextRequest('https://ca.test/api/birdseye/sources?offset=-1'),
      )
    ).status,
  ).toBe(400)
})
test('share mutation requires same-origin authenticated owner; revoke persists without changing unrelated metadata', async () => {
  const request = (origin = 'https://ca.test') =>
    new NextRequest('https://ca.test/api/birdseye/sharing', {
      method: 'POST',
      headers: { origin },
    })
  expect((await POST(request())).status).toBe(401)
  session = owner
  expect((await POST(request('https://evil.test'))).status).toBe(403)
  expect(updateUserById).not.toHaveBeenCalled()
  const response = await POST(request())
  expect(response.status).toBe(200)
  const { url } = await response.json()
  expect(await resolveBirdseyeShare(url.split('/').pop())).toMatchObject({
    username: 'alice',
  })
  expect((await DELETE(request())).status).toBe(200)
  expect(await resolveBirdseyeShare(url.split('/').pop())).toBeNull()
  expect(stored.app_metadata.provider_id).toBe('123')
})

test('a share link redirects without the secret and uses a private HttpOnly cookie', async () => {
  const { GET } = await import('@/app/api/birdseye/share/[token]/route')
  const share = createBirdseyeShare(owner)
  stored.app_metadata.birdseye_share = share.setting
  const response = await GET(
    new NextRequest(`https://ca.test/api/birdseye/share/${share.token}`),
    { params: { token: share.token } },
  )
  expect(response.status).toBe(303)
  expect(response.headers.get('location')).toBe(
    'https://ca.test/birdseye?username=alice',
  )
  expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(response.cookies.get(SHARE_COOKIE)).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })
})

test('real admins can list and read eligible profiles without becoming the owner', async () => {
  session = {
    ...owner,
    identities: [
      { provider: 'twitter', identity_data: { user_name: 'admin' } },
    ],
  } as unknown as User
  jest.mocked(isAdminUser).mockReturnValue(true)
  expect(await getBirdseyeProfiles()).toEqual(['alice'])
  expect(await loadAccessibleBirdseye('alice')).toMatchObject({
    isAdmin: true,
    isOwner: false,
  })
  expect(member).not.toHaveBeenCalled()
  jest.mocked(getAppPolicy).mockResolvedValue({
    members: new Set(),
    blocked: new Set(['alice']),
    blockedIds: new Set(),
  })
  expect(await getBirdseyeProfiles()).toEqual([])
  expect(await loadAccessibleBirdseye('alice')).toBeNull()
})

test('local admin can browse sources, logout removes access, and no Auth identity is fabricated', async () => {
  jest.mocked(getLocalAdminPreview).mockResolvedValue('admin')
  expect(await getBirdseyeProfiles()).toEqual(['alice'])
  expect(await loadAccessibleBirdseye('alice')).toMatchObject({
    isAdmin: true,
    isOwner: false,
    sharingEnabled: false,
  })
  expect(
    (
      await sources(
        new NextRequest(
          'http://localhost:3031/api/birdseye/sources?username=alice&cluster_id=topic',
        ),
      )
    ).status,
  ).toBe(200)
  expect(updateUserById).not.toHaveBeenCalled()
  jest.mocked(getLocalAdminPreview).mockResolvedValue('signed-out')
  expect(await getBirdseyeProfiles()).toEqual([])
  expect(await loadAccessibleBirdseye('alice')).toBeNull()
})

test('remaining sources skip the highlighted posts before applying pagination', async () => {
  session = owner
  const response = await sources(
    new NextRequest(
      'https://ca.test/api/birdseye/sources?username=alice&cluster_id=topic&exclude=1,5',
    ),
  )
  expect(response.status).toBe(200)
  expect(getSourceTweets).toHaveBeenCalledWith(['2', '3', '4', '6', '7', '8'])
  expect(await response.json()).toMatchObject({ nextOffset: 6 })
})

test('source grouping failures remain private and retryable', async () => {
  session = owner
  jest
    .mocked(getBirdseyeSourceIndex)
    .mockRejectedValueOnce(new Error('offline'))
  const response = await sources(
    new NextRequest(
      'https://ca.test/api/birdseye/sources?username=alice&cluster_id=topic',
    ),
  )
  expect(response.status).toBe(503)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(getSourceTweets).not.toHaveBeenCalled()
})
