import type { User, UserIdentity } from '@supabase/supabase-js'
import { isTwitterUsername } from '@/lib/apiInputValidation'

// SECURITY: account identity comes from the Twitter/X OAuth identity, whose
// identity_data Supabase Auth writes from the provider's response. Never read
// it from user_metadata: any signed-in user can rewrite that with
// supabase.auth.updateUser({ data: ... }) and claim another account.
type IdentityUser = Pick<User, 'identities'>
type AccountUser = Pick<User, 'identities' | 'app_metadata'>

export const normalizeTwitterUsername = (value: unknown): string | null => {
  if (typeof value !== 'string') return null

  const username = value.trim().toLowerCase().replace(/^@/, '')
  return isTwitterUsername(username) ? username : null
}

export const getTwitterIdentity = (user: IdentityUser): UserIdentity | null =>
  user.identities?.find((identity) =>
    ['twitter', 'x'].includes(identity.provider ?? ''),
  ) ?? null

const getIdentityData = (identity: UserIdentity) =>
  (identity.identity_data ?? {}) as Record<string, unknown>

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

// Lowercased: the stored identity keeps the provider's case, while storage
// folders and username lookups use the lowercase handle.
export const getTwitterUsername = (user: IdentityUser): string | null => {
  const identity = getTwitterIdentity(user)
  if (!identity) return null

  const data = getIdentityData(identity)
  for (const key of [
    'user_name',
    'preferred_username',
    'screen_name',
    'username',
  ]) {
    const username = normalizeTwitterUsername(data[key])
    if (username) return username
  }

  return null
}

export const getTwitterProviderId = (user: IdentityUser): string | null => {
  const identity = getTwitterIdentity(user)
  if (!identity) return null

  const data = getIdentityData(identity)
  return nonEmptyString(data.provider_id ?? data.sub ?? identity.id)
}

export const getTwitterAvatarUrl = (user: IdentityUser): string | null => {
  const identity = getTwitterIdentity(user)
  if (!identity) return null

  const data = getIdentityData(identity)
  for (const key of [
    'avatar_url',
    'picture',
    'profile_image_url_https',
    'profile_image_url',
  ]) {
    const url = nonEmptyString(data[key])
    if (url) return url
  }

  return null
}

export interface AccountIdentity {
  providerId: string | null
  username: string | null
}

// The Twitter/X identity first, then app_metadata, which only the server can
// write (dev and staging mock logins have no Twitter identity and set it
// there). The archive RPCs and storage policies re-check ownership against the
// JWT, so this chooses what to request; the database decides what is allowed.
export const getAccountIdentity = (user: AccountUser): AccountIdentity => ({
  providerId:
    getTwitterProviderId(user) ??
    nonEmptyString(user.app_metadata?.provider_id),
  username:
    getTwitterUsername(user) ??
    normalizeTwitterUsername(user.app_metadata?.user_name),
})
