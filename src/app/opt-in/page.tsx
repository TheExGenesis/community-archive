import { requireAuth, getOptInStatus } from '@/lib/auth-utils'
import OptInForm from '@/components/OptInForm'
import { isStagingOptInPreviewEnabled } from '@/lib/stagingOptInPreview'

interface OptInPageProps {
  searchParams?: {
    mockOptIn?: string | string[]
  }
}

export default async function OptInPage({ searchParams }: OptInPageProps) {
  const { user } = await requireAuth()
  const mockOptIn = isStagingOptInPreviewEnabled(
    searchParams?.mockOptIn === '1',
  )
  const optInData = mockOptIn ? null : (await getOptInStatus(user.id)).data

  return (
    <main className="min-h-screen bg-card dark:bg-background">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <OptInForm
          userId={user.id}
          initialOptInStatus={optInData}
          mockOptIn={mockOptIn}
        />
      </div>
    </main>
  )
}
