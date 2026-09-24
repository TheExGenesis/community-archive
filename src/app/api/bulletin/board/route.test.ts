import { GET } from './route'
import { isBulletinAdmin, requireBulletinUser } from '@/lib/bulletin/data'
import { loadBulletinPage } from '@/lib/bulletin/page'

jest.mock('@/lib/bulletin/data', () => ({
  isBulletinAdmin: jest.fn(),
  requireBulletinUser: jest.fn(),
}))
jest.mock('@/lib/bulletin/page', () => ({
  BulletinCursorExpired: class BulletinCursorExpired extends Error {},
  loadBulletinPage: jest.fn(),
}))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(requireBulletinUser).mockResolvedValue(null)
  jest.mocked(isBulletinAdmin).mockResolvedValue(false)
  jest.mocked(loadBulletinPage).mockResolvedValue({} as never)
})

test('keeps Jev controls behind admin authorization', async () => {
  const request = new Request(
    'https://community-archive.org/api/bulletin/board?minValue=2&topics=arts&metric=value',
  )
  expect((await GET(request)).status).toBe(403)
  expect(loadBulletinPage).not.toHaveBeenCalled()

  jest.mocked(isBulletinAdmin).mockResolvedValue(true)
  expect((await GET(request)).status).toBe(200)
  expect(loadBulletinPage).toHaveBeenCalledWith(
    expect.objectContaining({ minValue: 2, topics: ['arts'], sortBy: 'value' }),
    undefined,
  )
})

test('rejects invalid Jev settings before loading notices', async () => {
  expect(
    (
      await GET(
        new Request(
          'https://community-archive.org/api/bulletin/board?maxJoke=2',
        ),
      )
    ).status,
  ).toBe(400)
  expect(loadBulletinPage).not.toHaveBeenCalled()
})
