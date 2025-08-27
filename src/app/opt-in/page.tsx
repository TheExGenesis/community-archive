import { requireAuth, getOptInStatus } from '@/lib/auth-utils'
import OptInForm from '@/components/OptInForm'
import { notFound } from 'next/navigation'

export default async function OptInPage() {
  // Check if streaming features are enabled
  if (process.env.NEXT_PUBLIC_ENABLE_STREAMING_FEATURES !== 'true') {
    notFound()
  }

  const { user } = await requireAuth()
  const { data: optInData } = await getOptInStatus(user.id)

  return (
    <main className="min-h-screen bg-white dark:bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-card rounded-lg shadow-lg p-6 md:p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Tweet Streaming Opt-In
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Allow your public tweets to be automatically preserved in the Community Archive 
              through our browser extension for historical and research purposes.
            </p>
          </div>

          <OptInForm 
            userId={user.id} 
            userEmail={user.email || ''} 
            initialOptInStatus={optInData}
          />

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              By opting in, you agree to our{' '}
              <a 
                href="/data-policy" 
                className="text-blue-600 dark:text-blue-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Data Policy
              </a>
              . Your public tweets will be archived and may persist even after deletion from Twitter/X.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}