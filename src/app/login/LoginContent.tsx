'use client'

import SignIn from '@/components/SignIn'
import DevSignIn from '@/components/DevSignIn'

interface LoginContentProps {
  redirectUrl?: string
}

export default function LoginContent({ redirectUrl }: LoginContentProps) {
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
            
            {/* Developer sign in option - always available in dev mode */}
            <DevSignIn redirectUrl={redirectUrl} />
          </div>
        </div>
      </div>
    </main>
  )
}