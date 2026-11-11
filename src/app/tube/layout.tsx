import { Suspense, type ReactNode } from 'react'
import { TubeShell } from '@/components/tube/TubeShell'

export default function TubeLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <TubeShell>{children}</TubeShell>
    </Suspense>
  )
}
