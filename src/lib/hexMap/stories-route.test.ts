import { NextRequest } from 'next/server'
import { GET } from '@/app/api/hex-map/stories/route'
import { MAP_VERSION } from './version'
import { storyPage, weeklyMapPage } from './data'
jest.mock('./data', () => ({ storyPage: jest.fn(), weeklyMapPage: jest.fn() }))
const request = (query: string) =>
  new NextRequest(
    `http://localhost/api/hex-map/stories?version=${MAP_VERSION}&${query}`,
  )
beforeEach(() => jest.clearAllMocks())
const week = {
  weekStart: '2026-11-09',
  weekEnd: '2026-11-15',
  soFar: true,
  stories: [],
  located: true,
}

it('shares the located current week at the edge', async () => {
  jest.mocked(weeklyMapPage).mockResolvedValue(week)
  const response = await GET(request('kind=weekly'))
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe(
    'public, s-maxage=120, stale-while-revalidate=60',
  )
  expect(await response.json()).toEqual(week)
  expect(storyPage).not.toHaveBeenCalled()
})

it('never shares an unlocated week, and fails without a cacheable empty payload', async () => {
  jest.mocked(weeklyMapPage).mockResolvedValue({ ...week, located: false })
  const unlocated = await GET(request('kind=weekly'))
  expect(unlocated.status).toBe(200)
  expect(unlocated.headers.get('Cache-Control')).toBe('private, no-store')

  jest.mocked(weeklyMapPage).mockRejectedValue(new Error('down'))
  const failed = await GET(request('kind=weekly'))
  expect(failed.status).toBe(503)
  expect(failed.headers.get('Cache-Control')).toBe('private, no-store')
})

it('rejects cluster or paged weekly requests before reading', async () => {
  for (const query of ['kind=weekly&cells=1', 'kind=weekly&offset=2']) {
    const response = await GET(request(query))
    expect(response.status).toBe(400)
  }
  expect(weeklyMapPage).not.toHaveBeenCalled()
})
