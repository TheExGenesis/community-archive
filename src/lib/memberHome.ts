import 'server-only'

import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { createServerClient } from '@/utils/supabase'

const accountPattern = /^\d{1,20}$/

// An archive older than this gets a nudge to upload a newer export.
export const STALE_ARCHIVE_DAYS = 180

export type MemberArchive = {
  archiveAt: string
  uploadedAt: string | null
  phase:
    | 'uploading'
    | 'ready_for_commit'
    | 'committing'
    | 'completed'
    | 'failed'
  numTweets: number | null
}

export type MemberHomeState = {
  accountId: string | null
  username: string | null
  optedIn: boolean
  archive: MemberArchive | null
}

const trustedAccountId = (user: User | null) => {
  const providerId = user?.app_metadata?.provider_id
  return typeof providerId === 'string' && accountPattern.test(providerId)
    ? providerId
    : null
}

const trustedUsername = (user: User | null) => {
  const name = user?.app_metadata?.user_name
  return typeof name === 'string' && name ? name.replace(/^@/, '') : null
}

/**
 * What the member home needs to know about the viewer: their trusted X
 * identity, whether they opted in, and their latest archive upload.
 */
export async function loadMemberHomeState(
  user: User | null,
): Promise<MemberHomeState> {
  const accountId = trustedAccountId(user)
  const username = trustedUsername(user)
  if (!user) return { accountId, username, optedIn: false, archive: null }

  const supabase = createServerClient(cookies())
  const [optIn, uploads] = await Promise.all([
    // Match /settings: older opt-in rows are keyed by username, not user id.
    username
      ? supabase
          .from('optin')
          .select('opted_in')
          .or(
            `user_id.eq.${user.id},username.eq.${username.toLowerCase().replace(/[^a-z0-9_]/g, '')}`,
          )
          .limit(1)
          .maybeSingle()
      : supabase
          .from('optin')
          .select('opted_in')
          .eq('user_id', user.id)
          .maybeSingle(),
    accountId
      ? supabase
          .from('archive_upload')
          .select(
            'archive_at, created_at, upload_phase, accounts:all_account!left(num_tweets)',
          )
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (optIn.error)
    console.error('Member home opt-in read failed:', optIn.error.message)
  if (uploads.error)
    console.error('Member home archive read failed:', uploads.error.message)

  const latest = uploads.data?.[0]
  const account = Array.isArray(latest?.accounts)
    ? latest?.accounts[0]
    : latest?.accounts

  return {
    accountId,
    username,
    optedIn: optIn.data?.opted_in ?? false,
    archive: latest
      ? {
          archiveAt: latest.archive_at,
          uploadedAt: latest.created_at,
          phase: latest.upload_phase ?? 'uploading',
          numTweets: account?.num_tweets ?? null,
        }
      : null,
  }
}

export function isArchiveStale(archiveAt: string, now = Date.now()): boolean {
  const at = Date.parse(archiveAt)
  if (!Number.isFinite(at)) return false
  return now - at > STALE_ARCHIVE_DAYS * 24 * 60 * 60 * 1000
}
