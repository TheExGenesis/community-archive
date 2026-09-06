const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1_000

export const DIGEST_DAY_START_UTC_HOUR = 6

function shiftDate(digestDate: string, days: number) {
  const [year, month, day] = digestDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return shifted.toISOString().slice(0, 10)
}

export function digestDateForCommunityDay(date = new Date()) {
  return new Date(date.getTime() - DIGEST_DAY_START_UTC_HOUR * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10)
}

export function getDigestDateWindow(digestDate: string) {
  if (!DATE_PATTERN.test(digestDate)) throw new Error('Invalid digest date')
  const windowStart = new Date(
    `${digestDate}T${String(DIGEST_DAY_START_UTC_HOUR).padStart(2, '0')}:00:00.000Z`,
  )
  const windowEnd = new Date(windowStart.getTime() + DAY_MS)
  if (
    Number.isNaN(windowStart.getTime()) ||
    Number.isNaN(windowEnd.getTime()) ||
    windowStart >= windowEnd
  ) {
    throw new Error('Invalid digest date')
  }
  return {
    digestDate,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  }
}

export function listPastDigestDates(count = 7, now = new Date()) {
  const today = digestDateForCommunityDay(now)
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    shiftDate(today, -(index + 1)),
  )
}

export function getLatestCompletedDigestDate(now = new Date()) {
  return listPastDigestDates(1, now)[0]
}

export function isRecentPastDigestDate(
  digestDate: string,
  now = new Date(),
  maximumDays = 30,
) {
  if (!DATE_PATTERN.test(digestDate)) return false
  return listPastDigestDates(maximumDays, now).includes(digestDate)
}
