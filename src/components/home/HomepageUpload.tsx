'use client'

import dynamic from 'next/dynamic'
import { useNearViewport } from '@/hooks/useNearViewport'

const UploadArchiveSection = dynamic(
  () => import('@/components/UploadArchiveSection'),
  {
    ssr: false,
    loading: () => <UploadPlaceholder />,
  },
)

function UploadPlaceholder() {
  return (
    <div
      className="min-h-96 text-center"
      role="status"
      aria-label="Loading archive upload"
    >
      <h2 className="text-3xl font-bold">Upload your tweets</h2>
      <div className="mt-8 h-64 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}

export default function HomepageUpload() {
  const { ref, visible } = useNearViewport('400px')
  return (
    <div ref={ref}>
      {visible ? <UploadArchiveSection /> : <UploadPlaceholder />}
    </div>
  )
}
