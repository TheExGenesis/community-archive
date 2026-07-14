import { requireAuth, getOptInStatus } from '@/lib/auth-utils'
import OptInForm from '@/components/OptInForm'

export default async function OptInPage() {
  const { user } = await requireAuth()
  const { data: optInData } = await getOptInStatus(user.id)

  return (
    <main className="min-h-screen bg-card dark:bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-card p-6 shadow-lg md:p-8">
          <div className="mb-8 text-center">
            <h1 className="mb-4 text-4xl font-bold text-foreground">
              Tweet Streaming Opt-In
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Allow your public tweets to be automatically preserved in the
              Community Archive through our browser extension for historical and
              research purposes.
            </p>
          </div>

          <OptInForm
            userId={user.id}
            userEmail={user.email || ''}
            initialOptInStatus={optInData}
          />

          <div className="mt-8 border-t border-border pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              By opting in, you agree to our{' '}
              <a
                href="/data-policy"
                className="text-brand hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Data Policy
              </a>
              . Your public tweets will be archived and may persist even after
              deletion from Twitter/X.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
