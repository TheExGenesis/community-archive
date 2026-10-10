import { NextRequest } from 'next/server'
import { GET } from './route'
import { findShelfRow } from '@/lib/shelf/data'
import { canCurateShelf } from '@/lib/shelf/access'
import { fetchSafeRemoteResource } from '@/lib/linkPreviews'

jest.mock('@/lib/shelf/data', () => ({ findShelfRow: jest.fn() }))
jest.mock('@/lib/shelf/access', () => ({ canCurateShelf: jest.fn() }))
jest.mock('@/lib/linkPreviews', () => ({ fetchSafeRemoteResource: jest.fn() }))

const key = 'a'.repeat(32)
const get = (query: string) =>
  GET(new NextRequest(`https://community-archive.org/api/shelf/cover?${query}`))
const found = (isPublic: boolean, image_url: string | null) => ({
  isPublic,
  row: { image_url } as never,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(fetchSafeRemoteResource).mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    contentType: 'image/jpeg',
  } as never)
})

test('rejects anything but an account and a key; there is no url input', async () => {
  for (const query of [
    '',
    `account_id=x&key=${key}`,
    'account_id=42&key=short',
    `account_id=42&url=https://evil.test/a.png`,
  ])
    expect((await get(query)).status).toBe(400)
  expect(findShelfRow).not.toHaveBeenCalled()
})

test('serves an approved cover publicly with long cache headers', async () => {
  jest
    .mocked(findShelfRow)
    .mockResolvedValue(found(true, 'https://covers.openlibrary.org/b/1.jpg'))
  const response = await get(`account_id=42&key=${key}`)
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toContain('public')
  expect(response.headers.get('Content-Type')).toBe('image/jpeg')
  expect(fetchSafeRemoteResource).toHaveBeenCalledWith(
    'https://covers.openlibrary.org/b/1.jpg',
    expect.objectContaining({ maximumBytes: 2 * 1024 * 1024 }),
  )
})

test('keeps owner-only covers out of shared caches and checks the owner', async () => {
  jest.mocked(findShelfRow).mockImplementation(async (_a, _k, ownerView) => {
    await ownerView()
    return found(false, 'https://i.ytimg.com/vi/x/hqdefault.jpg')
  })
  const response = await get(`account_id=42&key=${key}`)
  expect(canCurateShelf).toHaveBeenCalledWith('42')
  expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600')
})

test('404s unknown or unimaged items and 502s failed fetches', async () => {
  jest.mocked(findShelfRow).mockResolvedValueOnce(null)
  expect((await get(`account_id=42&key=${key}`)).status).toBe(404)
  jest.mocked(findShelfRow).mockResolvedValueOnce(found(true, null))
  expect((await get(`account_id=42&key=${key}`)).status).toBe(404)
  jest
    .mocked(findShelfRow)
    .mockResolvedValueOnce(found(true, 'https://x.test/a.png'))
  jest.mocked(fetchSafeRemoteResource).mockRejectedValueOnce(new Error('big'))
  const failed = await get(`account_id=42&key=${key}`)
  expect(failed.status).toBe(502)
  expect(failed.headers.get('Cache-Control')).toBe('no-store')
  jest.mocked(findShelfRow).mockRejectedValueOnce(new Error('db down'))
  expect((await get(`account_id=42&key=${key}`)).status).toBe(503)
})
