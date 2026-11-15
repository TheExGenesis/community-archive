import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { LibraryWorkPage } from '@/components/library/LibraryWorkPage'

export const metadata = {
  title: 'CA Library · Community Archive',
  description:
    'What Community Archive members tweeted about one work in the CA Library.',
}

// A static shell per work id, cached after the first request; the browser
// fetches the catalogue and the work's tweets from the cached library routes.
export const dynamic = 'force-static'
export const dynamicParams = true
export function generateStaticParams() {
  return []
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!/^[0-9a-f]{10}$/.test(id)) notFound()
  return (
    <Suspense>
      <LibraryWorkPage id={id} />
    </Suspense>
  )
}
