import 'server-only'
import { getAppPolicy } from '@/lib/community-apps/data'
import { mapGateway, type MapLookup } from './gateway'
import { MAP_VERSION } from './version'

/** The gateway applies its fresh production membership/opt-out projection first. */
export async function readMapLookup(
  params: Record<string, string>,
): Promise<MapLookup> {
  const result = await mapGateway<MapLookup>('hex-lookup', params)
  if (result.version !== MAP_VERSION || !Array.isArray(result.people))
    throw new Error('Map version mismatch')
  // A selected area only displays six avatars; bound the extra policy reads.
  const candidates = params.cells ? result.people.slice(0, 24) : result.people
  // Preview sessions and consent writes use staging. Rechecking these public
  // production results against staging would incorrectly remove real members.
  if (process.env.VERCEL_ENV === 'preview')
    return { ...result, people: candidates }
  const policy = await getAppPolicy(candidates.map((p) => p.username))
  return {
    ...result,
    people: candidates.filter(
      (p) =>
        policy.members.has(p.username.toLowerCase()) &&
        !policy.blocked.has(p.username.toLowerCase()) &&
        !policy.blockedIds.has(p.account_id),
    ),
  }
}
