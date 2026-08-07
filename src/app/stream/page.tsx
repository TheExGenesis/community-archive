import { redirect } from 'next/navigation'
import Portal from '@/components/portal/Portal'
import { getIsMember } from '@/lib/portal/auth'
import { getPortalData } from '@/lib/portal/data'

export const metadata = { title: 'Stream · Community Archive' }
export const maxDuration = 60

export default async function StreamPage() {
  if (!(await getIsMember())) redirect('/')
  const data = await getPortalData('stream')
  return <Portal data={data} view="stream" />
}
