import type { Metadata } from 'next'
import { ShelfPage, shelfMetadata } from '../shelfPage'

interface PageProps {
  params: { account_id: string; work: string }
}

export function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return shelfMetadata(params.account_id, decodeURIComponent(params.work))
}

/** The shelf opened on one work, so the work can be linked and shared. */
export default function UserShelfWorkPage({ params }: PageProps) {
  return (
    <ShelfPage
      accountIdParam={params.account_id}
      workSlug={decodeURIComponent(params.work)}
    />
  )
}
