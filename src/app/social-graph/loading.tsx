'use client'
import { useEffect } from 'react'
import { PortalPageLoading } from '@/components/portal/PortalPageLoading'

export default function Loading() {
  // Download the graph engine while the public snapshot is in flight.
  useEffect(() => {
    void import('./SocialGraphExplorer').catch(() => {})
  }, [])
  return <PortalPageLoading label="Loading Social graph" />
}
