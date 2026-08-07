import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'
import ClassicHomepage from '@/components/home/ClassicHomepage'
import Portal from '@/components/portal/Portal'
import { getPortalData } from '@/lib/portal/data'

// Signed-in members get the live archive portal; everyone else sees the
// classic marketing homepage. Auth comes from cookies, so this page renders
// dynamically — the portal's data layer does its own caching (24h for heavy
// aggregates, minutes for stats and the initial stream).
export default async function Homepage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Dev-only escape hatch to preview the portal without an account.
  const devPortalPreview =
    process.env.NODE_ENV === 'development' && searchParams?.as === 'member'

  if (!user && !devPortalPreview) {
    return <ClassicHomepage />
  }

  const data = await getPortalData()
  return <Portal data={data} />
}
