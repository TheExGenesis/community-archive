export interface OptInMutation {
  username: string
  optedIn: boolean
  termsVersion: string
  explicitOptOut?: boolean
  optOutReason?: string | null
}

export class OptInApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message)
    this.name = 'OptInApiError'
  }
}

const parseRetryAfter = (value: string | null): number | null => {
  if (!value) return null

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds)
  }

  const retryAt = Date.parse(value)
  if (Number.isNaN(retryAt)) return null

  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))
}

const formatRetryDelay = (seconds: number | null) => {
  if (seconds === null) return 'a moment'
  if (seconds < 60) return `${Math.max(1, seconds)} seconds`

  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

const readJson = async (response: Response) => {
  try {
    return (await response.json()) as { error?: unknown } | null
  } catch {
    return null
  }
}

export async function updateOptIn(
  mutation: OptInMutation,
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl('/api/opt-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mutation),
  })
  const data = await readJson(response)

  if (!response.ok) {
    const retryAfterSeconds = parseRetryAfter(
      response.headers.get('Retry-After'),
    )
    const serverError =
      typeof data?.error === 'string' && data.error.trim()
        ? data.error.trim()
        : null

    if (response.status === 429) {
      throw new OptInApiError(
        `Too many requests. Please wait ${formatRetryDelay(retryAfterSeconds)} and try again.`,
        response.status,
        retryAfterSeconds,
      )
    }

    throw new OptInApiError(
      serverError || 'Failed to update opt-in status. Please try again.',
      response.status,
      retryAfterSeconds,
    )
  }

  return data
}
