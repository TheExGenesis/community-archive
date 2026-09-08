import 'server-only'
import { getAdminClient } from './data'

export type RecentOptIn = {
  id: string
  username: string
  twitter_user_id: string | null
  opted_in_at: string | null
  created_at: string | null
}
export type RecentOptInsData = { optIns: RecentOptIn[]; failed: boolean }

export async function loadRecentOptIns(): Promise<RecentOptInsData> {
  const admin = await getAdminClient()
  try {
    const query = () =>
      admin
        .from('optin')
        .select('id, username, twitter_user_id, opted_in_at, created_at')
        .eq('opted_in', true)
        .or('explicit_optout.is.null,explicit_optout.eq.false')
    // Older rows lack opted_in_at. Merge the newest records from each group
    // so recent legacy rows are not hidden behind dated records.
    const responses = await Promise.all([
      query()
        .not('opted_in_at', 'is', null)
        .order('opted_in_at', { ascending: false })
        .order('id')
        .limit(20),
      query()
        .is('opted_in_at', null)
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id')
        .limit(20),
    ])
    if (responses.some((response) => response.error))
      throw new Error('Opt-in read failed')
    const optIns = responses
      .flatMap((response) => response.data ?? [])
      .sort(
        (a, b) =>
          (b.opted_in_at ?? b.created_at ?? '').localeCompare(
            a.opted_in_at ?? a.created_at ?? '',
          ) || a.id.localeCompare(b.id),
      )
      .slice(0, 20)
    return { optIns, failed: false }
  } catch {
    return { optIns: [], failed: true }
  }
}
