import { TubeWatch } from '@/components/tube/TubeWatch'

export const metadata = { title: 'CA Tube · Community Archive' }

export default async function TubeWatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <TubeWatch id={id} />
}
