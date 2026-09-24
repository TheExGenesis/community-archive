import { POST } from './route'
import { loadBulletinBoardSnapshot } from '@/lib/bulletin/data'

jest.mock('@/lib/bulletin/data', () => ({
  loadBulletinBoardSnapshot: jest.fn(),
}))

const secret = 's'.repeat(40)
const request = (token?: string) =>
  new Request('https://www.community-archive.org/api/bulletin/preview-board', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

const previousEnv = process.env.VERCEL_ENV
const previousSecret = process.env.BULLETIN_PREVIEW_READ_SECRET
afterAll(() => {
  if (previousEnv === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = previousEnv
  if (previousSecret === undefined)
    delete process.env.BULLETIN_PREVIEW_READ_SECRET
  else process.env.BULLETIN_PREVIEW_READ_SECRET = previousSecret
})
beforeEach(() => {
  jest.clearAllMocks()
  process.env.VERCEL_ENV = 'production'
  process.env.BULLETIN_PREVIEW_READ_SECRET = secret
})

test('returns no board data without the production-only secret', async () => {
  for (const token of [undefined, 'wrong', secret.slice(0, -1)])
    expect((await POST(request(token))).status).toBe(404)
  process.env.VERCEL_ENV = 'preview'
  expect((await POST(request(secret))).status).toBe(404)
  expect(loadBulletinBoardSnapshot).not.toHaveBeenCalled()
})

test('returns fresh policy-filtered board metadata only to the secret holder', async () => {
  jest
    .mocked(loadBulletinBoardSnapshot)
    .mockResolvedValue([{ tweet_id: '1' }] as never)
  const response = await POST(request(secret))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual([{ tweet_id: '1' }])
  expect(loadBulletinBoardSnapshot).toHaveBeenCalledTimes(1)
})
