import 'server-only'
import { getAppPolicy } from '@/lib/community-apps/data'
import { mapGateway, type MapLookup, type MapPeoplePage } from './gateway'
import { MAP_VERSION } from './version'
import { readMemberPage } from './memberCache'
import { usesProductionReadSource } from '@/lib/publicDataSource'

/** The gateway applies its fresh production membership/opt-out projection first. */
export async function readMapLookup(
  params: Record<string, string>,
): Promise<MapLookup> {
  const result = params.cells
    ? await readMemberPage(
        Array.from(new Set(params.cells.split(',').map(Number)))
          .sort((a, b) => a - b)
          .join(','),
        String(Number(params.offset || 0)),
      )
    : await mapGateway<MapLookup>('hex-lookup', params)
  if (result.version !== MAP_VERSION || !Array.isArray(result.people))
    throw new Error('Map version mismatch')
  if (params.peoplePage) {
    const next = (result as MapPeoplePage).nextOffset
    if (
      result.people.length > 24 ||
      !(
        next === null ||
        (Number.isInteger(next) &&
          next > Number(params.offset || 0) &&
          next <= 10000)
      )
    )
      throw new Error('Map backend does not support people pages yet')
  }
  // A selected area only displays six avatars; bound the extra policy reads.
  const candidates =
    params.cells && !params.peoplePage
      ? result.people.slice(0, 24)
      : result.people
  // Preview sessions and consent writes use staging. Rechecking these public
  // production results against staging would incorrectly remove real members.
  if (process.env.VERCEL_ENV === 'preview' && !usesProductionReadSource())
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
