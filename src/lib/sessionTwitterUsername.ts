import type { User } from '@supabase/supabase-js'
import { isProductionSupabaseUrl } from '@/lib/isProductionSupabaseUrl'
import {
  getTwitterUsername,
  normalizeTwitterUsername,
} from '@/lib/twitterIdentity'

export interface SessionIdentityEnvironment {
  nodeEnv?: string
  stagingDevLoginEnabled?: boolean
  useRemoteDevDb?: boolean
  supabaseUrl?: string
  localSupabaseUrl?: string
}

const getDefaultEnvironment = (): SessionIdentityEnvironment => ({
  nodeEnv: process.env.NODE_ENV,
  stagingDevLoginEnabled: process.env.ENABLE_STAGING_DEV_LOGIN === 'true',
  useRemoteDevDb: process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  localSupabaseUrl: process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL,
})

const getActiveSupabaseUrl = (environment: SessionIdentityEnvironment) =>
  environment.nodeEnv === 'development' && !environment.useRemoteDevDb
    ? environment.localSupabaseUrl
    : environment.supabaseUrl

const getTrustedMockUsername = (
  user: User,
  environment: SessionIdentityEnvironment,
): string | null => {
  const mockLoginEnabled =
    environment.nodeEnv === 'development' ||
    environment.stagingDevLoginEnabled === true
  const activeSupabaseUrl = getActiveSupabaseUrl(environment)

  if (
    !mockLoginEnabled ||
    !activeSupabaseUrl ||
    isProductionSupabaseUrl(activeSupabaseUrl)
  ) {
    return null
  }

  return normalizeTwitterUsername(user.app_metadata?.user_name)
}

// Real OAuth identity data is authoritative in every environment. Mock-user
// app_metadata is accepted only when the mock login is enabled and the active
// Supabase project is definitively not production. app_metadata is written by
// the server-side auth admin client and cannot be changed by regular users.
// We intentionally do not require a provider marker because staging users
// created before that field was introduced still have a trusted user_name.
export const getSessionTwitterUsername = (
  user: User,
  environment: SessionIdentityEnvironment = getDefaultEnvironment(),
) => getTwitterUsername(user) ?? getTrustedMockUsername(user, environment)
