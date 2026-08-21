import {
  getLatestCompletedDigestDate,
  isRecentPastDigestDate,
} from './dateWindow'

export function isAuthorizedDigestCronRequest(
  request: Request,
  cronSecret = process.env.CRON_SECRET,
) {
  return Boolean(
    cronSecret &&
      request.headers.get('authorization') === `Bearer ${cronSecret}`,
  )
}

export function isNightlyDigestAutomationEnabled(
  value = process.env.DIGEST_AUTOMATION_ENABLED,
) {
  return value === 'true'
}

export function resolveDigestAutomationDate(
  requestedDate: unknown,
  now = new Date(),
) {
  if (requestedDate === undefined) return getLatestCompletedDigestDate(now)
  if (
    typeof requestedDate !== 'string' ||
    !isRecentPastDigestDate(requestedDate, now)
  ) {
    throw new Error('Digest date must be within the last 30 completed days.')
  }
  return requestedDate
}
