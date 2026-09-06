const joinedDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

// Directory dates are calendar labels shared by server HTML and hydration.
export function formatDirectoryDate(date: string | null) {
  return date ? joinedDateFormatter.format(new Date(date)) : '—'
}
