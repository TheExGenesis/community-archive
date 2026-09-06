import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function validatePublicExportFreshness(latest, now = Date.now()) {
  const maxAgeMs = 36 * 60 * 60 * 1000
  for (const [label, value] of Object.entries({
    'export creation': latest.created_at,
    'consent snapshot': latest.consent_snapshot_at,
  })) {
    // ClickHouse emits UTC without an offset; do not interpret it in runner-local time.
    const normalized =
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
        ? `${value.replace(' ', 'T')}Z`
        : value
    const timestamp =
      typeof normalized === 'string' ? Date.parse(normalized) : NaN
    if (!Number.isFinite(timestamp))
      throw new Error(`Missing or invalid ${label} timestamp.`)
    const age = now - timestamp
    if (age < -5 * 60 * 1000 || age > maxAgeMs) {
      throw new Error(
        `Public ${label} is outside the 36-hour freshness window (${value}).`,
      )
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    validatePublicExportFreshness(
      JSON.parse(readFileSync(process.argv[2], 'utf8')),
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
