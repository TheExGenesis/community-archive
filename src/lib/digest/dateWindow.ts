const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function datePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(
    parts
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<string, number>
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = datePartsInTimeZone(date, timeZone)
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return representedAsUtc - Math.floor(date.getTime() / 1_000) * 1_000
}

function midnightInTimeZone(digestDate: string, timeZone: string) {
  const [year, month, day] = digestDate.split('-').map(Number)
  const guess = Date.UTC(year, month - 1, day)
  let result = guess - timeZoneOffsetMs(new Date(guess), timeZone)
  result = guess - timeZoneOffsetMs(new Date(result), timeZone)
  return new Date(result)
}

function shiftDate(digestDate: string, days: number) {
  const [year, month, day] = digestDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return shifted.toISOString().slice(0, 10)
}

export function digestDateInTimeZone(
  date = new Date(),
  timeZone = 'America/Los_Angeles',
) {
  const parts = datePartsInTimeZone(date, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function getDigestDateWindow(
  digestDate: string,
  timeZone = 'America/Los_Angeles',
) {
  if (!DATE_PATTERN.test(digestDate)) throw new Error('Invalid digest date')
  const windowStart = midnightInTimeZone(digestDate, timeZone)
  const windowEnd = midnightInTimeZone(shiftDate(digestDate, 1), timeZone)
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

export function listPastDigestDates(
  count = 7,
  now = new Date(),
  timeZone = 'America/Los_Angeles',
) {
  const today = digestDateInTimeZone(now, timeZone)
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    shiftDate(today, -(index + 1)),
  )
}

export function isRecentPastDigestDate(
  digestDate: string,
  now = new Date(),
  maximumDays = 30,
  timeZone = 'America/Los_Angeles',
) {
  if (!DATE_PATTERN.test(digestDate)) return false
  return listPastDigestDates(maximumDays, now, timeZone).includes(digestDate)
}
