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
