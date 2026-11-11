import { getCurrentWeek, inProgressWeekStart } from './currentWeek'
import { getPublishedDigest, getPublishedDigestsBetween } from './data'
import { getPublishedWeeklyDigest } from './weeklyData'

jest.mock('./data', () => ({
  getPublishedDigest: jest.fn(),
  getPublishedDigestsBetween: jest.fn(),
}))
jest.mock('./weeklyData', () => ({ getPublishedWeeklyDigest: jest.fn() }))

const latest = (digestDate: string, isPreview = false) =>
  jest
    .mocked(getPublishedDigest)
    .mockResolvedValue({ digestDate, isPreview } as never)

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getPublishedWeeklyDigest).mockResolvedValue(null)
  jest.mocked(getPublishedDigestsBetween).mockResolvedValue([])
})

test('the week of the newest daily is in progress until its weekly is out', async () => {
  latest('2026-11-11')
  expect(await inProgressWeekStart()).toBe('2026-11-09')
  expect(getPublishedWeeklyDigest).toHaveBeenCalledWith('2026-11-09')

  jest.mocked(getPublishedWeeklyDigest).mockResolvedValue({} as never)
  expect(await inProgressWeekStart()).toBeNull()
})

test('a finished week stays in progress on Sunday', async () => {
  latest('2026-11-15')
  expect(await inProgressWeekStart()).toBe('2026-11-09')
})

test('there is no week in progress without a real published daily', async () => {
  jest.mocked(getPublishedDigest).mockResolvedValue(null)
  expect(await inProgressWeekStart()).toBeNull()
  latest('2026-08-11', true)
  expect(await getCurrentWeek()).toBeNull()
})

test('reads the Monday to Sunday editions of the week in progress', async () => {
  latest('2026-11-10')
  const editions = [{ digestDate: '2026-11-09' }, { digestDate: '2026-11-10' }]
  jest.mocked(getPublishedDigestsBetween).mockResolvedValue(editions as never)
  const week = await getCurrentWeek()
  expect(getPublishedDigestsBetween).toHaveBeenCalledWith(
    '2026-11-09',
    '2026-11-15',
  )
  expect(week).toEqual({
    weekStart: '2026-11-09',
    dates: expect.arrayContaining(['2026-11-09', '2026-11-15']),
    editions,
  })
})
