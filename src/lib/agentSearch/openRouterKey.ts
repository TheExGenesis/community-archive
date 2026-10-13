import 'server-only'
import { agentSearchModelSpec, parseModelSpec } from './model'
import { ownKeySecret, type OwnKeyError } from './ownKey'

/**
 * Whether members may use their own key: the planner must be an OpenRouter
 * model and the sealing secret must be set.
 */
export function ownKeysEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  try {
    return (
      ownKeySecret(env) !== null &&
      parseModelSpec(agentSearchModelSpec(env.AGENT_SEARCH_MODEL)).provider ===
        'openrouter'
    )
  } catch {
    return false
  }
}

const KEY_URL = 'https://openrouter.ai/api/v1/key'
const CHECK_TIMEOUT_MS = 8_000

export type OwnKeyCheck =
  | {
      ok: true
      /** USD left under the key's spending limit; null when it has none. */
      limitRemaining: number | null
    }
  | { ok: false; reason: OwnKeyError }

interface KeyInfo {
  limit_remaining?: unknown
  is_free_tier?: unknown
  is_management_key?: unknown
  effective_budget?: { remaining_usd?: unknown } | null
}

const finite = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * Asks OpenRouter about a key before a question is paid with it
 * (GET /api/v1/key, openrouter.ai/docs/api/api-reference/api-keys). The
 * planner is a paid model, so a free-tier key, a management key (which
 * cannot call models) and a key with no limit or budget left are refused
 * here, with a reason the member can act on, instead of failing mid-run.
 * Account credit itself is not reported by this endpoint; a call that finds
 * none fails with 402 and the run says so.
 */
export async function checkOpenRouterKey(
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OwnKeyCheck> {
  let response: Response
  try {
    response = await fetchImpl(KEY_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch {
    return { ok: false, reason: 'own_key_unchecked' }
  }
  if (response.status === 401) return { ok: false, reason: 'own_key_invalid' }
  if (response.status === 429) {
    return { ok: false, reason: 'own_key_rate_limited' }
  }
  if (!response.ok) return { ok: false, reason: 'own_key_unchecked' }
  const body = (await response.json().catch(() => null)) as {
    data?: KeyInfo
  } | null
  const info = body?.data
  if (!info) return { ok: false, reason: 'own_key_unchecked' }
  if (info.is_management_key === true) {
    return { ok: false, reason: 'own_key_invalid' }
  }
  const limitRemaining = finite(info.limit_remaining)
  const budgetRemaining = finite(info.effective_budget?.remaining_usd)
  if (
    info.is_free_tier === true ||
    (limitRemaining !== null && limitRemaining <= 0) ||
    (budgetRemaining !== null && budgetRemaining <= 0)
  ) {
    return { ok: false, reason: 'own_key_no_credit' }
  }
  // The key's label is not passed on: by default it is the key, masked.
  return { ok: true, limitRemaining }
}
