import { redirect } from 'next/navigation'
import Portal from '@/components/portal/Portal'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalData } from '@/lib/portal/data'

export const metadata = { title: 'Field Notes · Community Archive' }

export default async function NotesPage({
  searchParams,
}: {
  searchParams?: { article?: string }
}) {
  if (!(await getIsMember())) redirect('/')
  const data = await getPortalData()
  return (
    <Portal data={data} view="notes" initialArticleId={searchParams?.article} />
  )
}
