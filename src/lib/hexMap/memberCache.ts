import 'server-only'
import { unstable_cache } from 'next/cache'
import { createServerServiceRoleClient } from '@/utils/supabase'
import {
  createPublicReadClient,
  usesProductionReadSource,
} from '@/lib/publicDataSource'
import { readDirectoryMembers } from '@/lib/directoryMembers'
import { mapGateway, type MapPeoplePage } from './gateway'
import { MAP_VERSION } from './version'

export const MAP_MEMBERS_TAG = 'hex-map-members'

// Shared across visitors and both selection surfaces. Cache candidates and
// avatars only; readMapLookup still checks current consent on every request.
export const readMemberPage = unstable_cache(
  async (cells: string, offset: string): Promise<MapPeoplePage> => {
    const result = await mapGateway<MapPeoplePage>('hex-lookup', {
      cells,
      offset,
      peoplePage: '1',
    })
    if (
      result.version !== MAP_VERSION ||
      !Array.isArray(result.people) ||
      result.people.length > 24 ||
      !(
        result.nextOffset === null ||
        (Number.isInteger(result.nextOffset) &&
          result.nextOffset > Number(offset) &&
          result.nextOffset <= 10000)
      )
    )
      throw new Error('Invalid map member page')

    if (
      !result.people.length ||
      (process.env.VERCEL_ENV === 'preview' && !usesProductionReadSource())
    )
      return result
    const client = usesProductionReadSource()
      ? createPublicReadClient()
      : createServerServiceRoleClient({
          noStore: true,
        })
    const members = await readDirectoryMembers(
      client,
      result.people.map((person) => person.username),
    )
    const avatars = new Map(
      members.map((row) => [row.account_id, row.avatar_media_url]),
    )
    return {
      ...result,
      people: result.people.map((person) => ({
        ...person,
        avatar: avatars.get(person.account_id) ?? null,
      })),
    }
  },
  [
    'hex-member-pages-v2',
    MAP_VERSION,
    process.env.VERCEL_ENV ?? 'local',
    process.env.DATA_READ_SOURCE ?? 'app',
    process.env.PORTAL_READ_SUPABASE_URL ?? '',
  ],
  { revalidate: 60, tags: [MAP_MEMBERS_TAG] },
)
