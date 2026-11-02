// A member may pay for their own questions with their own OpenRouter key.
// The key lives in their browser and comes with each question as a header.
// The server never stores it in plaintext: the route seals it (AES-256-GCM,
// bound to the run id) before it enters the workflow, whose inputs and step
// arguments are persisted in the event log, and only the model step unseals
// it, just before the call. Nothing here imports Node modules: model.ts,
// which unseals, is also part of the sandboxed workflow bundle.

/** The request header that carries a member's OpenRouter key. */
export const OWN_KEY_HEADER = 'x-openrouter-key'

/** Questions a day on one's own key, as a multiple of the house limit. */
export const OWN_KEY_LIMIT_MULTIPLIER = 10

/** Who pays for a run's planner calls. */
export type KeySource = 'house' | 'own'

// OpenRouter keys look like `sk-or-v1-` and 64 hex characters; allow some
// room for other versions without accepting arbitrary text.
const KEY_PATTERN = /^sk-or-[A-Za-z0-9_-]{16,200}$/

export function looksLikeOpenRouterKey(value: string): boolean {
  return KEY_PATTERN.test(value)
}

/** Replaces anything shaped like an OpenRouter key, for errors and logs. */
export function redactKeys(text: string): string {
  return text.replace(/sk-or-[A-Za-z0-9_-]+/g, 'sk-or-…')
}

const MIN_SECRET_LENGTH = 32

/**
 * The server secret that seals keys, or null when it is missing or too short
 * to trust; without it, own keys are refused rather than passed in the clear.
 */
export function ownKeySecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const secret = env.AGENT_SEARCH_KEY_SECRET?.trim()
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null
}

const VERSION = 'v1'
const encoder = new TextEncoder()

const toBase64Url = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of Array.from(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (text: string) => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function aesKey(secret: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

/**
 * Seals a key for one run. The run id is authenticated data: a sealed key
 * copied from one run's event log does not open for another run.
 */
export async function sealOwnKey(
  key: string,
  runId: string,
  secret: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(runId) },
    await aesKey(secret),
    encoder.encode(key),
  )
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`
}

/** Opens a sealed key; throws when the secret, run or text do not match. */
export async function unsealOwnKey(
  sealed: string,
  runId: string,
  secret: string,
): Promise<string> {
  const [version, iv, body] = sealed.split('.')
  if (version !== VERSION || !iv || !body) {
    throw new Error('Unreadable sealed key')
  }
  const opened = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64Url(iv),
      additionalData: encoder.encode(runId),
    },
    await aesKey(secret),
    fromBase64Url(body),
  )
  return new TextDecoder().decode(opened)
}

/**
 * The messages a question on one's own key can fail with. The route uses the
 * codes; the model step throws the texts when OpenRouter refuses mid-run.
 */
export const OWN_KEY_ERRORS = {
  own_key_invalid: 'OpenRouter did not accept your key.',
  own_key_no_credit: 'Your OpenRouter key has no credit left.',
  own_key_refused:
    'OpenRouter refused this request on your key: a budget or limit set on the key, or its moderation.',
  own_key_rate_limited: 'OpenRouter is rate-limiting your key.',
  own_key_unchecked: 'Your OpenRouter key could not be checked.',
  own_key_unavailable: 'Using your own key is not available right now.',
} as const

export type OwnKeyError = keyof typeof OWN_KEY_ERRORS

/** The error for an OpenRouter HTTP status on a call made with an own key. */
export function ownKeyErrorForStatus(status: number): OwnKeyError | null {
  if (status === 401) return 'own_key_invalid'
  if (status === 402) return 'own_key_no_credit'
  // 403 is a budget or limit on the key, or moderation (OpenRouter's docs).
  if (status === 403) return 'own_key_refused'
  if (status === 429) return 'own_key_rate_limited'
  return null
}
