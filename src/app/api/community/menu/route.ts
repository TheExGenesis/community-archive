import { NextResponse } from 'next/server'
import { loadPublishedCommunityProjects } from '@/lib/communityProjectDatabase'
import { communityMenu, mergeCommunityCatalog } from '@/lib/communityProjects'

// The header's Community preview: the picked apps and the live gallery size.
// Rebuilt at most hourly, so opening the menu never reaches the database.
export const revalidate = 3600

export async function GET() {
  const published = await loadPublishedCommunityProjects({ withCounts: false })
  return NextResponse.json(communityMenu(mergeCommunityCatalog(published)), {
    headers: {
      'Cache-Control':
        'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
