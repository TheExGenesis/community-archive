import type { DigestCalendarDay } from './types'

export function mergeDigestCalendarDays(
  published: DigestCalendarDay[],
  preview: DigestCalendarDay | null,
): DigestCalendarDay[] {
  const byDate = new Map<string, DigestCalendarDay>()
  if (preview) byDate.set(preview.digestDate, preview)

  // A real publication always replaces preview data for the same day.
  for (const edition of published) byDate.set(edition.digestDate, edition)

  return Array.from(byDate.values()).sort((left, right) =>
    right.digestDate.localeCompare(left.digestDate),
  )
}
