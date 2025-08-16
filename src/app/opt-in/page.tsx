import { requireAuth, getOptInStatus } from '@/lib/auth-utils'
import OptInForm from '@/components/OptInForm'

export default async function OptInPage() {
  const { user } = await requireAuth()
  const { data: optInData } = await getOptInStatus(user.id)

  return (
    <main className="min-h-screen bg-white dark:bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-card rounded-lg shadow-lg p-6 md:p-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
            Tweet Streaming Opt-In
          </h1>

          <div className="mb-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
              ℹ️ What is Tweet Streaming?
            </h2>
            <p className="text-blue-800 dark:text-blue-200">
              Tweet streaming allows your public tweets to be automatically saved to the Community Archive 
              through our browser extension. This helps preserve Twitter/X content for historical and research purposes.
            </p>
          </div>

          <div className="space-y-6 mb-8">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Terms and Conditions
              </h2>
              <div className="prose dark:prose-invert max-w-none">
                <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                  <li>
                    <strong>Public Tweets Only:</strong> Only your public tweets will be collected. 
                    Private accounts, DMs, and protected tweets are never included.
                  </li>
                  <li>
                    <strong>Data Persistence:</strong> Once collected, tweets may remain in the archive 
                    even if you delete them from Twitter/X.
                  </li>
                  <li>
                    <strong>Your Control:</strong> You can opt-out at any time. However, tweets already 
                    collected will remain unless you manually delete them from the archive.
                  </li>
                  <li>
                    <strong>Third-Party Collection:</strong> By opting in, you agree that anyone using 
                    the Community Archive Stream Extension can save your public tweets.
                  </li>
                  <li>
                    <strong>Data Usage:</strong> Archived tweets may be used for research, historical 
                    preservation, and public access purposes.
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Privacy Policy
              </h2>
              <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                <p className="mb-3">
                  <strong>Data Collection:</strong> We collect only publicly available tweet data including 
                  text content, media URLs, timestamps, and engagement metrics. No private information is collected.
                </p>
                <p className="mb-3">
                  <strong>Data Storage:</strong> Your tweets are stored in our secure database and may be 
                  replicated across multiple backup systems for preservation.
                </p>
                <p className="mb-3">
                  <strong>Data Access:</strong> Archived tweets are publicly accessible through our search 
                  interface. Anyone can view tweets you&apos;ve opted to stream.
                </p>
                <p className="mb-3">
                  <strong>Data Deletion:</strong> You maintain the right to delete your archived tweets by 
                  logging into the archive. Deletion is permanent and cannot be reversed.
                </p>
                <p className="mb-3">
                  <strong>Contact:</strong> For privacy concerns or data requests, please contact us through 
                  the repository issues page.
                </p>
              </div>
            </section>

            <section className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                ⚠️ Important Notice
              </h3>
              <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                Tweets you delete on Twitter/X may continue to exist in the Community Archive. 
                To remove them from the archive, you must log in here and delete them manually. 
                By opting in, you acknowledge and accept this data persistence.
              </p>
            </section>
          </div>

          <OptInForm 
            userId={user.id} 
            userEmail={user.email || ''} 
            initialOptInStatus={optInData}
          />
        </div>
      </div>
    </main>
  )
}