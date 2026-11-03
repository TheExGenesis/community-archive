import { TubeLibrary } from '@/components/tube/TubePages'

export const metadata = { title: 'Watch later · CA Tube' }

export default function Page() {
  return <TubeLibrary kind="later" />
}
