import { Suspense } from 'react'
import { LibraryHome } from '@/components/library/LibraryHome'

export const metadata = {
  title: 'CA Library · Community Archive',
  description:
    'The essays, books, films, videos and papers that Community Archive members keep tweeting about.',
}

// Static shell; the catalogue is a static file the browser fetches.
export default function LibraryPage() {
  return (
    <Suspense>
      <LibraryHome />
    </Suspense>
  )
}
