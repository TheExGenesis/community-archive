import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/database-types'
import { getCurrentUser } from '@/lib/portal/auth'
import {
  getTwitterProviderId,
  getTwitterUsername,
  normalizeTwitterUsername,
} from '@/lib/twitterIdentity'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getAppPolicy } from '@/lib/community-apps/data'
import { readMapLookup } from '@/lib/hexMap/lookup'
import { MAP_VERSION } from '@/lib/hexMap/version'
import snapshot from '@/lib/hexMap/snapshot.json'

export const dynamic = 'force-dynamic'
type ConsentRow = Pick<
  Database['public']['Tables']['optin']['Row'],
  'user_id' | 'username' | 'twitter_user_id' | 'opted_in' | 'explicit_optout'
>
const headers = { 'Cache-Control': 'private, no-store' }
const reply = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers })

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('version') !== MAP_VERSION)
    return reply(409, { error: 'Map version changed; reload the page.' })
  try {
    const user = await getCurrentUser()
    if (!user)
      return reply(401, {
        status: 'sign_in',
        error: 'Opt in with Twitter to find yourself on the map.',
      })
    const username = getTwitterUsername(user)
    const accountId = getTwitterProviderId(user)
    if (!username || !accountId || !/^\d+$/.test(accountId))
      return reply(403, {
        error: 'Sign in with a verified X account to find yourself.',
      })
    const requested = request.nextUrl.searchParams.get('name')?.trim()
    const target = requested ? normalizeTwitterUsername(requested) : username
    if (!target || !/^\w{1,15}$/.test(target))
      return reply(400, { error: 'Enter a valid X username.' })
    const isSelf = target === username

    // Recognize existing manual consent as well as OAuth-linked records. The
    // stable provider ID prevents a recycled handle from granting consent.
    const admin = createServerServiceRoleClient()
    let optedIn = false
    let optedOut = false
    for (let offset = 0; ; offset += 1000) {
      const consentPage: { data: ConsentRow[] | null; error: unknown } =
        await admin
          .from('optin')
          .select('user_id,username,twitter_user_id,opted_in,explicit_optout')
          .or(
            `user_id.eq.${user.id},twitter_user_id.eq.${accountId},username.ilike.${username}`,
          )
          .order('id')
          .range(offset, offset + 999)
      if (consentPage.error) throw new Error('Consent unavailable')
      const rows: ConsentRow[] = consentPage.data ?? []
      for (const row of rows) {
        // ILIKE treats underscores as wildcards; only exact handles count.
        if (
          row.user_id !== user.id &&
          row.twitter_user_id !== accountId &&
          row.username.toLowerCase() !== username
        )
          continue
        // Opt-outs apply conservatively even when the record is inconsistent.
        if (row.explicit_optout) optedOut = true
        const ownsRecord = row.twitter_user_id
          ? row.twitter_user_id === accountId
          : row.user_id
            ? row.user_id === user.id
            : row.username.toLowerCase() === username
        if (ownsRecord && row.opted_in) optedIn = true
      }
      if (rows.length < 1000) break
    }
    if (!optedIn || optedOut)
      return reply(403, {
        status: 'opt_in',
        username,
        error: 'Opt in to the Community Archive before plotting yourself.',
      })
    const policy = await getAppPolicy([username])
    if (policy.blocked.has(username) || policy.blockedIds.has(accountId))
      return reply(403, {
        status: 'opt_in',
        username,
        error:
          'This account is opted out. Update your consent before plotting yourself.',
      })
    const unavailable = () =>
      reply(404, {
        status: 'not_mapped',
        username,
        error: isSelf
          ? 'Your account is not available on this map yet. New opt-ins can take time to appear.'
          : 'This username is not available on the map.',
      })
    const result = await readMapLookup({ names: target })
    if (result.version !== MAP_VERSION) throw new Error('Map version mismatch')
    const person = result.people.find(
      (p) =>
        (!isSelf || p.account_id === accountId) &&
        p.username.toLowerCase() === target,
    )
    if (
      !person ||
      !Number.isInteger(person.cell) ||
      !snapshot.cells[person.cell]
    )
      return unavailable()
    return reply(200, {
      status: 'located',
      person: { username: person.username, cell: person.cell },
      isSelf,
    })
  } catch {
    return reply(503, {
      error: 'Your map location is temporarily unavailable. Please try again.',
    })
  }
}
