import 'server-only'

import { createServerServiceRoleClient } from '@/utils/supabase'
import type { Database } from '@/database-types'

export type HiddenDirectoryUser =
  Database['public']['Tables']['directory_hidden_users']['Row']

export function directoryVisibilityKey(user: {
  account_id: string | null
  username: string
}) {
  return user.account_id
    ? `id:${user.account_id}`
    : `username:${user.username.toLowerCase()}`
}

export async function getHiddenDirectoryUsers(): Promise<
  HiddenDirectoryUser[]
> {
  const client = createServerServiceRoleClient({
    noStore: true,
    readSource: 'app',
  })
  const rows: HiddenDirectoryUser[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from('directory_hidden_users')
      .select('*')
      .order('visibility_key')
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
}
