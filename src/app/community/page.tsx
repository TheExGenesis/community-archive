import type { Metadata } from 'next'
import { Suspense } from 'react'
import {
  GallerySession,
  GallerySessionValue,
} from '@/components/community/GallerySession'
import {
  loadCommunityProjectLikeCounts,
  loadCommunityProjectLikedSlugsForUser,
  loadPublishedCommunityProjects,
} from '@/lib/communityProjectDatabase'
import { COMMUNITY_PROJECTS } from '@/lib/communityProjects'
import { getCurrentUser } from '@/lib/portal/auth'

export const metadata: Metadata = {
  title: 'Community Apps · Community Archive',
  description:
    'Independent tools, experiments, research, and games built with Community Archive data.',
  openGraph: {
    title: 'Community Apps · Community Archive',
    description:
      'Independent tools, experiments, research, and games built with Community Archive data.',
    images: [
      {
        url: '/images/community/og.png',
        width: 1200,
        height: 630,
        alt: 'Community Apps — independent projects built with the archive',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Community Apps · Community Archive',
    description:
      'Independent tools, experiments, research, and games built with Community Archive data.',
    images: ['/images/community/og.png'],
  },
}

async function Viewer({ result }: { result: ReturnType<typeof loadViewer> }) {
  return <GallerySessionValue session={await result} />
}
async function loadViewer() {
  const user = await getCurrentUser()
  return {
    isSignedIn: Boolean(user),
    likedProjectSlugs: await loadCommunityProjectLikedSlugsForUser(user?.id),
  }
}
export default async function CommunityPage() {
  const viewer = loadViewer()
  // Attach rejection handling immediately while the independent catalog read runs.
  void viewer.catch(() => {})
  const [publishedProjects, likeCounts] = await Promise.all([
    loadPublishedCommunityProjects(),
    loadCommunityProjectLikeCounts(
      COMMUNITY_PROJECTS.map((project) => project.slug),
    ),
  ])
  return (
    <GallerySession projects={publishedProjects} likeCounts={likeCounts}>
      <Suspense fallback={null}>
        <Viewer result={viewer} />
      </Suspense>
    </GallerySession>
  )
}
