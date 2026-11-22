import { POST } from './route'
import { loadBulletinBoardSnapshot } from '@/lib/bulletin/data'
import { generateBulletinTitles } from '@/lib/bulletin/titles'

jest.mock('@/lib/bulletin/data', () => ({
  loadBulletinBoardSnapshot: jest.fn(),
}))
jest.mock('@/lib/bulletin/titles', () => ({
  TITLES_PER_REQUEST_MAX: 40,
  generateBulletinTitles: jest.fn(),
}))

const secret = 's'.repeat(40)
const request = (token?: string, body?: unknown) =>
  new Request('https://www.community-archive.org/api/bulletin/titles', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const now = Date.parse('2026-11-19T12:00:00Z')
const stored = (id: string, extra: Record<string, unknown> = {}) => ({
  tweet_id: id,
  account_id: 'a',
  username: 'u',
  posted_at: new Date(now - 3600_000).toISOString(),
  kind: 'help',
  side: 'offer',
  summary: 'Offering design help for small nonprofits',
  topics: [],
  standing: false,
  expires_at: null,
  place: null,
  evidence: '',
  respond: 'dm',
  content_hash: 'h',
  value_score: 1,
  p_opportunity: 0.9,
  p_joke: 0.1,
  ...extra,
})

const previousEnv = process.env.VERCEL_ENV
const previousSecret = process.env.BULLETIN_TITLES_SECRET
afterAll(() => {
  if (previousEnv === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = previousEnv
  if (previousSecret === undefined) delete process.env.BULLETIN_TITLES_SECRET
  else process.env.BULLETIN_TITLES_SECRET = previousSecret
})
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(now)
  jest.spyOn(console, 'info').mockImplementation(() => {})
  process.env.VERCEL_ENV = 'production'
  process.env.BULLETIN_TITLES_SECRET = secret
  jest.mocked(generateBulletinTitles).mockResolvedValue({
    candidates: 1,
    attempted: 1,
    titled: 1,
    untitled: 0,
    failed: 0,
    remaining: 0,
  })
})
afterEach(() => jest.restoreAllMocks())

test('does nothing without the production-only secret', async () => {
  for (const token of [undefined, 'wrong', secret.slice(0, -1)])
    expect((await POST(request(token))).status).toBe(404)
  process.env.VERCEL_ENV = 'preview'
  expect((await POST(request(secret))).status).toBe(404)
  expect(loadBulletinBoardSnapshot).not.toHaveBeenCalled()
  expect(generateBulletinTitles).not.toHaveBeenCalled()
})

test('titles live stored notices only, with a bounded limit', async () => {
  jest
    .mocked(loadBulletinBoardSnapshot)
    .mockResolvedValue([
      stored('1'),
      stored('2', { posted_at: new Date(now - 90 * 86400_000).toISOString() }),
    ] as never)
  const response = await POST(request(secret, { limit: 500 }))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    live: 1,
    titled: 1,
    remaining: 0,
  })
  const [notices, options] = jest.mocked(generateBulletinTitles).mock.calls[0]
  expect(notices.map((o) => o.tweet_id)).toEqual(['1'])
  expect(options).toEqual({ limit: 40 })
})

test('reports a failed board read without details', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.mocked(loadBulletinBoardSnapshot).mockRejectedValue(new Error('db down'))
  const response = await POST(request(secret))
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({
    error: 'Bulletin titles unavailable',
  })
})
