import type { Metadata } from 'next'
import { ShelfPage, shelfMetadata } from './shelfPage'

interface PageProps {
  params: { account_id: string }
}

export function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return shelfMetadata(params.account_id)
}

export default function UserShelfPage({ params }: PageProps) {
  return <ShelfPage accountIdParam={params.account_id} />
}
