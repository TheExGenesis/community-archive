export interface ClaimedArchiveCompletionNotification {
  id: number
  recipient_email: string
  account_id: string
  archive_username: string | null
  archive_at: string
}

interface ArchiveCompletionEmail {
  from: string
  to: string[]
  subject: string
  text: string
  html: string
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

export const isAuthorizedCronRequest = (
  authorization: string | null,
  cronSecret: string | undefined,
) => Boolean(cronSecret && authorization === `Bearer ${cronSecret}`)

export const buildArchiveCompletionEmail = (
  notification: ClaimedArchiveCompletionNotification,
  from: string,
): ArchiveCompletionEmail => {
  const displayName = notification.archive_username
    ? `@${notification.archive_username.replace(/^@/, '')}`
    : 'your account'
  const archiveDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(notification.archive_at))
  const profileUrl = `https://www.community-archive.org/user/${encodeURIComponent(notification.account_id)}`

  return {
    from,
    to: [notification.recipient_email],
    subject: `Your Community Archive upload is ready`,
    text: [
      `Your archive upload for ${displayName} has finished processing.`,
      `Archive date: ${archiveDate}`,
      `View your profile: ${profileUrl}`,
      '',
      'You received this because you enabled archive completion notifications in Settings.',
      'You can turn them off at https://www.community-archive.org/settings',
    ].join('\n'),
    html: `
      <p>Your archive upload for <strong>${escapeHtml(displayName)}</strong> has finished processing.</p>
      <p>Archive date: ${escapeHtml(archiveDate)}</p>
      <p><a href="${profileUrl}">View your Community Archive profile</a></p>
      <hr>
      <p style="color:#666;font-size:13px">
        You received this because you enabled archive completion notifications in Settings.
        <a href="https://www.community-archive.org/settings">Turn notifications off</a>.
      </p>
    `.trim(),
  }
}

export const sendArchiveCompletionEmail = async ({
  notification,
  apiKey,
  from,
  fetchImpl = fetch,
}: {
  notification: ClaimedArchiveCompletionNotification
  apiKey: string
  from: string
  fetchImpl?: typeof fetch
}) => {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `archive-completion/${notification.id}`,
    },
    body: JSON.stringify(buildArchiveCompletionEmail(notification, from)),
  })

  const payload = (await response.json().catch(() => null)) as {
    id?: string
    message?: string
    name?: string
  } | null

  if (!response.ok || !payload?.id) {
    const detail =
      payload?.message || payload?.name || `HTTP ${response.status}`
    throw new Error(`Resend rejected the notification: ${detail}`)
  }

  return payload.id
}
