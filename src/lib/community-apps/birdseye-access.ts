import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { unstable_noStore as noStore } from 'next/cache'
import {
  createServerClient,
  createServerServiceRoleClient,
} from '@/utils/supabase'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import { getAppDataManifest, getAppPolicy, getBirdseyeAnalysis } from './data'

export const SHARE_COOKIE = 'birdseye-share'
export const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
}
const TOKEN = /^([a-f0-9-]{36})\.([a-f0-9]{64})$/
const hash = (secret: string) =>
  createHash('sha256').update(secret).digest('hex')

export function birdseyeIdentity(user: User | null) {
  const username = user && getSessionTwitterUsername(user)
  const accountId = user?.app_metadata?.provider_id
  return username && typeof accountId === 'string' && accountId.trim()
    ? { username, accountId }
    : null
}

export async function getBirdseyeOwner() {
  noStore()
  const {
    data: { user },
    error,
  } = await createServerClient(await cookies()).auth.getUser()
  return error ? null : user
}

export function createBirdseyeShare(user: User) {
  const identity = birdseyeIdentity(user)
  if (!identity) throw new Error('Twitter identity required')
  const secret = randomBytes(32).toString('hex')
  return {
    token: `${user.id}.${secret}`,
    setting: { ...identity, tokenHash: hash(secret) },
  }
}

export async function resolveBirdseyeShare(token: string | undefined) {
  noStore()
  const match = token?.match(TOKEN)
  if (!match) return null
  // Read current Auth metadata, never a cached JWT: revocation takes effect on
  // the very next page or source request, including an existing share cookie.
  const {
    data: { user },
    error,
  } = await createServerServiceRoleClient().auth.admin.getUserById(match[1])
  if (error || !user) return null
  const identity = birdseyeIdentity(user)
  const share = user.app_metadata?.birdseye_share
  if (
    !identity ||
    !share ||
    share.username !== identity.username ||
    share.accountId !== identity.accountId ||
    typeof share.tokenHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(share.tokenHash)
  )
    return null
  return timingSafeEqual(
    Buffer.from(share.tokenHash, 'hex'),
    Buffer.from(hash(match[2]), 'hex'),
  )
    ? identity
    : null
}

export async function loadAccessibleBirdseye(requestedUsername?: string) {
  noStore()
  const user = await getBirdseyeOwner()
  const owner = birdseyeIdentity(user)
  const requested = requestedUsername?.toLowerCase()
  if (requested && !/^[a-z0-9_]{1,15}$/.test(requested)) return null
  const shared =
    !owner || (requested && requested !== owner.username)
      ? await resolveBirdseyeShare((await cookies()).get(SHARE_COOKIE)?.value)
      : null
  const username = requested || owner?.username || shared?.username
  const isOwner = !!owner && username === owner.username
  const identity = isOwner
    ? owner
    : shared?.username === username
      ? shared
      : null
  if (!username || !identity) return null

  const policy = await getAppPolicy([username])
  if (!policy.members.has(username)) return null
  // A matching handle alone is insufficient if an account has been renamed.
  const { data: member, error } = await createServerServiceRoleClient()
    .from('user_directory')
    .select('username')
    .eq('account_id', identity.accountId)
    .maybeSingle()
  if (error) throw new Error('Birdseye ownership check unavailable')
  if (member?.username?.toLowerCase() !== username) return null
  const manifest = await getAppDataManifest()
  if (!manifest.birdseye.some((entry) => entry.username === username))
    return null
  const analysis = await getBirdseyeAnalysis(username, manifest, policy.blocked)
  return {
    analysis,
    isOwner,
    sharingEnabled: isOwner && !!user?.app_metadata?.birdseye_share,
  }
}
