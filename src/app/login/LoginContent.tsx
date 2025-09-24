'use client'

import SignIn from '@/components/SignIn'

interface LoginContentProps {
  redirectUrl?: string
}

export default function LoginContent({ redirectUrl }: LoginContentProps) {
  const isDev = process.env.NODE_ENV === 'development'
  
  return (
    <main className="min-h-screen bg-white dark:bg-background">
      <div className="max-w-md mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-card rounded-lg shadow-lg p-6 md:p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Sign In
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Sign in to access your account and manage your tweet streaming preferences
            </p>
            {redirectUrl && (
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                You&apos;ll be redirected to: {decodeURIComponent(redirectUrl)}
              </p>
            )}
          </div>

          <div className="space-y-6">
            <SignIn />
            
            {isDev && (
              <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  <strong>Dev Mode:</strong> Clicking the button above will sign you in with a test account instead of Twitter OAuth.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}