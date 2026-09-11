import { requireAuth, getOptInStatus } from '@/lib/auth-utils'
import OptInForm from '@/components/OptInForm'
import { isStagingOptInPreviewEnabled } from '@/lib/stagingOptInPreview'
import Link from 'next/link'

interface OptInPageProps {
  searchParams?: {
    mockOptIn?: string | string[]
    redirect?: string | string[]
  }
}

export default async function OptInPage({ searchParams }: OptInPageProps) {
  const fromBulletin = searchParams?.redirect === '/bulletin'
  const { user } = await requireAuth(
    fromBulletin ? '/opt-in?redirect=/bulletin' : '/opt-in',
  )
  const mockOptIn = isStagingOptInPreviewEnabled(
    searchParams?.mockOptIn === '1',
  )
  const optInData = mockOptIn ? null : (await getOptInStatus(user.id)).data
  const canVisitBulletin =
    optInData?.opted_in === true && optInData.explicit_optout !== true

  return (
    <main className="min-h-screen bg-card dark:bg-background">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {fromBulletin && (
          <div className="mb-8 rounded-lg border p-4">
            {canVisitBulletin ? (
              <Link href="/bulletin" className="font-medium underline">
                Continue to the bulletin
              </Link>
            ) : (
              <p>
                The bulletin is available to people who have opted in to
                Community Archive. Review the data policy below and choose
                whether to opt in.
              </p>
            )}
          </div>
        )}
        <OptInForm
          userId={user.id}
          initialOptInStatus={optInData}
          mockOptIn={mockOptIn}
        />
      </div>
    </main>
  )
}
