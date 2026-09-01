import type { Metadata } from 'next'
import CommunityGallery from '@/components/community/CommunityGallery'
import {
  loadCommunityProjectLikesForUser,
  loadPublishedCommunityProjects,
} from '@/lib/communityProjectDatabase'
import { getCurrentUser } from '@/lib/portal/auth'

export const metadata: Metadata = {
  title: 'Community Gallery · Community Archive',
  description:
    'Independent tools, experiments, research, and games built with Community Archive data.',
  openGraph: {
    title: 'Community Gallery · Community Archive',
    description:
      'Independent tools, experiments, research, and games built with Community Archive data.',
    images: [
      {
        url: '/images/community/og.png',
        width: 1200,
        height: 630,
        alt: 'Community Gallery — independent projects built with the archive',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Community Gallery · Community Archive',
    description:
      'Independent tools, experiments, research, and games built with Community Archive data.',
    images: ['/images/community/og.png'],
  },
}

export default async function CommunityPage() {
  const [user, publishedProjects] = await Promise.all([
    getCurrentUser(),
    loadPublishedCommunityProjects(),
  ])

  const likedProjectIds = await loadCommunityProjectLikesForUser(user?.id)

  return (
    <CommunityGallery
      isSignedIn={Boolean(user)}
      publishedProjects={publishedProjects}
      likedProjectIds={likedProjectIds}
    />
  )
}
