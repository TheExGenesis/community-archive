import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/database-types'

export type DirectoryMember =
  Database['public']['Functions']['directory_members_by_username']['Returns'][number]

const BATCH = 1000

/**
 * Current directory members for exact handles (case-insensitive), with the same
 * semantics as public.user_directory. Always a live read: never cache the result
 * as a consent decision. GET keeps it usable on read-only public clients.
 */
export async function readDirectoryMembers(
  client: SupabaseClient<Database>,
  usernames: string[],
): Promise<DirectoryMember[]> {
  const names = Array.from(
    new Set(usernames.map((name) => name.toLowerCase())),
  ).filter((name) => /^[a-z0-9_]{1,15}$/.test(name))
  const batches = []
  for (let start = 0; start < names.length; start += BATCH)
    batches.push(names.slice(start, start + BATCH))
  const results = await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await client.rpc(
        'directory_members_by_username',
        { p_usernames: batch },
        { get: true },
      )
      if (error) throw new Error('Directory membership check failed')
      return data ?? []
    }),
  )
  return results.flat()
}
