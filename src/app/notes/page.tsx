import { redirect } from 'next/navigation'
import { PortalNotes } from '@/components/portal/Portal'
import { getIsMember } from '@/lib/portal/auth'

export const metadata = { title: 'AI Field Notes · Community Archive' }

export default async function NotesPage({
  searchParams,
}: {
  searchParams?: Promise<{ article?: string }>
}) {
  const resolvedSearchParams = await searchParams
  if (!(await getIsMember())) redirect('/')
  return <PortalNotes initialArticleId={resolvedSearchParams?.article} />
}
