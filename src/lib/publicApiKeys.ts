import 'server-only'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import { createServerServiceRoleClient } from '@/utils/supabase'

/**
 * Self-service keys for the public read API at
 * analytics.community-archive.org/v1. The registry is authoritative in
 * PostgreSQL (`private.public_api_keys`); the website issues and revokes keys
 * and answers the gateway's server-to-server verification requests. Only the
 * SHA-256 of a key is stored, and the full key is shown once.
 */

export const PUBLIC_API_BASE_URL = 'https://analytics.community-archive.org/v1'
export const PUBLIC_API_KEY_ID_PATTERN = /^[a-z0-9]{16}$/
export const PUBLIC_API_KEY_SHA256_PATTERN = /^[0-9a-f]{64}$/
export const PUBLIC_API_KEY_LABEL_MAX_LENGTH = 80
export const PUBLIC_API_MAX_ACTIVE_KEYS = 5

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const ACCOUNT_ID_PATTERN = /^\d{1,20}$/

export type PublicApiKeySummary = {
  id: string
  label: string | null
  scopes: string[]
  requests_per_minute: number
  requests_per_day: number
  created_at: string
  expires_at: string | null
  last_used_at: string | null
  revoked_at: string | null
}

export type CreatedPublicApiKey = PublicApiKeySummary & { key: string }

export class PublicApiKeyError extends Error {
  constructor(
    readonly status: 400 | 403 | 409 | 429 | 503,
    message: string,
  ) {
    super(message)
  }
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function base32(bytes: Buffer): string {
  let output = ''
  let value = 0
  let bits = 0
  for (let index = 0; index < bytes.length; index += 1) {
    value = (value << 8) | bytes[index]
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    value &= (1 << bits) - 1
  }
  return output
}

/** `cak_` + 16-character public ID + `_` + 256 random bits (base64url). */
export function generatePublicApiKey(
  random: (size: number) => Buffer = randomBytes,
) {
  const keyId = base32(random(10))
  const key = `cak_${keyId}_${random(32).toString('base64url')}`
  return { keyId, key, keySha256: sha256Hex(key) }
}

export function normalizeKeyLabel(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new PublicApiKeyError(400, 'Label must be text.')
  }
  const label = value.replace(/\s+/g, ' ').trim()
  if (!label) return null
  if (label.length > PUBLIC_API_KEY_LABEL_MAX_LENGTH) {
    throw new PublicApiKeyError(
      400,
      `Label must be ${PUBLIC_API_KEY_LABEL_MAX_LENGTH} characters or fewer.`,
    )
  }
  return label
}

/** Trusted X account ID, from server-written app metadata only. */
export function trustedAccountId(user: User): string | null {
  const accountId = user.app_metadata?.provider_id
  return typeof accountId === 'string' && ACCOUNT_ID_PATTERN.test(accountId)
    ? accountId
    : null
}

function databaseFailure(error: { message?: string } | null): never {
  const message = error?.message || ''
  if (message.includes('active_key_limit')) {
    throw new PublicApiKeyError(
      409,
      `You already have ${PUBLIC_API_MAX_ACTIVE_KEYS} active keys. Revoke one you no longer use first.`,
    )
  }
  if (message.includes('daily_creation_limit')) {
    throw new PublicApiKeyError(
      429,
      'You have created the maximum number of keys for today. Try again tomorrow.',
    )
  }
  if (message.includes('api_access_suspended')) {
    throw new PublicApiKeyError(
      403,
      'API access is suspended for this account.',
    )
  }
  throw new PublicApiKeyError(503, 'API keys are temporarily unavailable.')
}

export async function listPublicApiKeys(
  userId: string,
): Promise<PublicApiKeySummary[]> {
  const { data, error } = await createServerServiceRoleClient({
    noStore: true,
  }).rpc('list_public_api_keys', { owner_user_id: userId })
  if (error) databaseFailure(error)
  return (data as PublicApiKeySummary[] | null) ?? []
}

export async function createPublicApiKey(
  user: User,
  label: string | null,
  generate = generatePublicApiKey,
): Promise<CreatedPublicApiKey> {
  const { keyId, key, keySha256 } = generate()
  const { data, error } = await createServerServiceRoleClient({
    noStore: true,
  }).rpc('create_public_api_key', {
    owner_user_id: user.id,
    owner_account_id: trustedAccountId(user) ?? '',
    new_key_id: keyId,
    new_key_sha256: keySha256,
    key_label: label ?? '',
  })
  if (error || !data) databaseFailure(error)
  return { ...(data as PublicApiKeySummary), key }
}

export async function revokePublicApiKey(
  userId: string,
  keyId: string,
): Promise<boolean> {
  if (!PUBLIC_API_KEY_ID_PATTERN.test(keyId)) return false
  const { data, error } = await createServerServiceRoleClient({
    noStore: true,
  }).rpc('revoke_public_api_key', {
    owner_user_id: userId,
    target_key_id: keyId,
  })
  if (error) databaseFailure(error)
  return data === true
}

export type VerifiedPublicApiKey =
  | { valid: false }
  | {
      valid: true
      key: {
        id: string
        consumer_id: string
        scopes: string[]
        requests_per_minute: number
        requests_per_day: number
        expires_at: string | null
      }
    }

export async function verifyPublicApiKey(
  keyId: string,
  keySha256: string,
): Promise<VerifiedPublicApiKey> {
  const { data, error } = await createServerServiceRoleClient({
    noStore: true,
  }).rpc('verify_public_api_key', {
    target_key_id: keyId,
    presented_key_sha256: keySha256,
  })
  if (error) databaseFailure(error)
  const result = data as VerifiedPublicApiKey | null
  return result?.valid === true ? result : { valid: false }
}

/** Constant-time check of the gateway's verifier bearer token. */
export function isVerifierAuthorized(authorization: string | null): boolean {
  const expected = process.env.PUBLIC_API_KEY_VERIFIER_TOKEN || ''
  if (expected.length < 32 || !authorization?.startsWith('Bearer '))
    return false
  const supplied = Buffer.from(authorization.slice('Bearer '.length))
  const wanted = Buffer.from(expected)
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted)
}
