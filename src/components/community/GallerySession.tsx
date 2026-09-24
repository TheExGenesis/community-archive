'use client'

import { useContext, useEffect, useState, type ReactNode } from 'react'
import CommunityGallery from './CommunityGallery'
import type { CommunityProject } from '@/lib/communityProjects'
import { useReportSectionReady } from '@/components/PagePerformance'

import { SessionContext, type Session } from './gallerySessionContext'

/** Public browsing works while request-scoped viewer state streams in. */
export function GallerySession({
  projects,
  likeCounts,
  children,
}: {
  projects: CommunityProject[]
  likeCounts: Record<string, number>
  children: ReactNode
}) {
  const [session, setSession] = useState<Session | null>(null)
  useReportSectionReady('gallery_catalog')
  return (
    <SessionContext.Provider value={{ ready: session !== null, setSession }}>
      <CommunityGallery
        publishedProjects={projects}
        likeCounts={likeCounts}
        isSignedIn={session?.isSignedIn ?? false}
        likedProjectSlugs={session?.likedProjectSlugs ?? []}
      />
      {children}
    </SessionContext.Provider>
  )
}
export function GallerySessionValue({ session }: { session: Session }) {
  const context = useContext(SessionContext)
  const setSession = context?.setSession
  useEffect(() => {
    setSession?.(session)
  }, [setSession, session])
  return null
}
