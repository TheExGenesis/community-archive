import { getVisibleStrand } from '@/lib/community-apps/data'
import { getCurrentUser } from '@/lib/portal/auth'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { isAdminUser } from '@/app/admin/data'
import * as likeRoute from './like/route'
import * as commentsRoute from './comments/route'
import * as commentRoute from './comments/[commentId]/route'

jest.mock('@/lib/community-apps/data', () => ({ getVisibleStrand: jest.fn() }))
jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/app/admin/data', () => ({ isAdminUser: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerClient: jest.fn(),
  createServerServiceRoleClient: jest.fn(),
}))

const mockStrand = getVisibleStrand as jest.MockedFunction<
  typeof getVisibleStrand
>
const mockUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>
const mockAdmin = isAdminUser as jest.MockedFunction<typeof isAdminUser>
const mockClient = createServerServiceRoleClient as jest.MockedFunction<
  typeof createServerServiceRoleClient
>

const SEED = '1234567890'
const COMMENT_ID = '11111111-2222-3333-4444-555555555555'

type Call = [string, unknown[]]

/**
 * Chainable stand-in for the Supabase query builder. Each `from(table)` call
 * takes the next queued result for that table and records the chain it saw.
 */
function setupDb(results: Record<string, unknown[]>) {
  const chains: Record<string, Call[][]> = {}
  const from = jest.fn((table: string) => {
    const calls: Call[] = []
    ;(chains[table] ??= []).push(calls)
    const result = results[table]?.shift() ?? { data: null, error: null }
    const builder: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then')
            return (
              resolve: (value: unknown) => unknown,
              reject: (reason: unknown) => unknown,
            ) => Promise.resolve(result).then(resolve, reject)
          return (...args: unknown[]) => {
            calls.push([String(prop), args])
            return builder
          }
        },
      },
    )
    return builder
  })
  mockClient.mockReturnValue({ from } as never)
  return chains
}

const params = { params: { seed: SEED } }
const post = (body: unknown) =>
  new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(body),
  })

describe('strand engagement routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStrand.mockResolvedValue({ id: SEED } as never)
    mockUser.mockResolvedValue({ id: 'user-1', identities: [] } as never)
    mockAdmin.mockReturnValue(false)
  })

  it('404s for malformed seeds without touching the database', async () => {
    setupDb({})
    const response = await likeRoute.GET(new Request('http://localhost'), {
      params: { seed: 'not-a-seed' },
    })
    expect(response.status).toBe(404)
    expect(mockStrand).not.toHaveBeenCalled()
  })

  it('404s for strands hidden by policy', async () => {
    mockStrand.mockResolvedValue(null)
    setupDb({})
    const response = await commentsRoute.GET(
      new Request('http://localhost'),
      params,
    )
    expect(response.status).toBe(404)
  })

  it('reports signed-out like state with the public count', async () => {
    mockUser.mockResolvedValue(null)
    setupDb({ strand_likes: [{ count: 4, error: null }] })
    const response = await likeRoute.GET(
      new Request('http://localhost'),
      params,
    )
    await expect(response.json()).resolves.toEqual({
      liked: false,
      signedIn: false,
      count: 4,
    })
  })

  it('requires a session to like', async () => {
    mockUser.mockResolvedValue(null)
    setupDb({})
    const response = await likeRoute.POST(
      new Request('http://localhost'),
      params,
    )
    expect(response.status).toBe(401)
  })

  it('upserts a like for the viewer and returns the new count', async () => {
    const chains = setupDb({
      strand_likes: [{ error: null }, { count: 5, error: null }],
    })
    const response = await likeRoute.POST(
      new Request('http://localhost'),
      params,
    )
    expect(response.status).toBe(200)
    expect(chains.strand_likes[0]).toContainEqual([
      'upsert',
      [
        { strand_id: SEED, user_id: 'user-1' },
        { onConflict: 'strand_id,user_id', ignoreDuplicates: true },
      ],
    ])
    await expect(response.json()).resolves.toEqual({ liked: true, count: 5 })
  })

  it('removes only the viewer like on DELETE', async () => {
    const chains = setupDb({
      strand_likes: [{ error: null }, { count: 2, error: null }],
    })
    const response = await likeRoute.DELETE(
      new Request('http://localhost'),
      params,
    )
    expect(chains.strand_likes[0]).toEqual([
      ['delete', []],
      ['eq', ['strand_id', SEED]],
      ['eq', ['user_id', 'user-1']],
    ])
    await expect(response.json()).resolves.toEqual({ liked: false, count: 2 })
  })

  it('lists live comments and flags the viewer’s own', async () => {
    const row = (id: string, user_id: string) => ({
      id,
      strand_id: SEED,
      user_id,
      content: `comment ${id}`,
      username: 'alice',
      display_name: 'Alice',
      created_at: '2026-10-07T12:00:00.000Z',
      updated_at: '2026-10-07T12:00:00.000Z',
      deleted_at: null,
    })
    const chains = setupDb({
      strand_comments: [
        { data: [row('a', 'user-1'), row('b', 'user-2')], error: null },
      ],
    })
    const response = await commentsRoute.GET(
      new Request('http://localhost'),
      params,
    )
    const body = await response.json()
    expect(body.count).toBe(2)
    expect(body.signedIn).toBe(true)
    expect(
      body.comments.map((c: { id: string; isOwn: boolean }) => [c.id, c.isOwn]),
    ).toEqual([
      ['a', true],
      ['b', false],
    ])
    expect(chains.strand_comments[0]).toContainEqual([
      'is',
      ['deleted_at', null],
    ])
  })

  it('rejects empty and oversized comments', async () => {
    setupDb({})
    for (const content of ['   ', 'x'.repeat(2001)]) {
      const response = await commentsRoute.POST(post({ content }), params)
      expect(response.status).toBe(400)
    }
  })

  it('stores a trimmed comment for the viewer', async () => {
    const chains = setupDb({
      strand_comments: [
        {
          data: {
            id: 'c1',
            strand_id: SEED,
            user_id: 'user-1',
            content: 'Lovely strand',
            username: null,
            display_name: null,
            created_at: '2026-10-07T12:00:00.000Z',
            updated_at: '2026-10-07T12:00:00.000Z',
            deleted_at: null,
          },
          error: null,
        },
      ],
    })
    const response = await commentsRoute.POST(
      post({ content: '  Lovely strand  ' }),
      params,
    )
    expect(response.status).toBe(201)
    expect(chains.strand_comments[0][0]).toEqual([
      'insert',
      [
        {
          strand_id: SEED,
          user_id: 'user-1',
          content: 'Lovely strand',
          username: null,
          display_name: null,
        },
      ],
    ])
    await expect(response.json()).resolves.toMatchObject({
      comment: { id: 'c1', content: 'Lovely strand', isOwn: true },
    })
  })

  it('forbids deleting someone else’s comment', async () => {
    setupDb({
      strand_comments: [
        {
          data: { id: COMMENT_ID, user_id: 'user-2', deleted_at: null },
          error: null,
        },
      ],
    })
    const response = await commentRoute.DELETE(
      new Request('http://localhost'),
      { params: { seed: SEED, commentId: COMMENT_ID } },
    )
    expect(response.status).toBe(403)
  })

  it('soft-deletes the viewer’s own comment', async () => {
    const chains = setupDb({
      strand_comments: [
        {
          data: { id: COMMENT_ID, user_id: 'user-1', deleted_at: null },
          error: null,
        },
        { error: null },
      ],
    })
    const response = await commentRoute.DELETE(
      new Request('http://localhost'),
      { params: { seed: SEED, commentId: COMMENT_ID } },
    )
    expect(response.status).toBe(200)
    const [update] = chains.strand_comments[1]
    expect(update[0]).toBe('update')
    expect(update[1][0]).toMatchObject({ deleted_at: expect.any(String) })
  })
})
