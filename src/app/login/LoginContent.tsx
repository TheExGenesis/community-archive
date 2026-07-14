'use client'

import SignIn from '@/components/SignIn'

interface LoginContentProps {
  redirectUrl?: string
}

export default function LoginContent({ redirectUrl }: LoginContentProps) {
  const isDev = process.env.NODE_ENV === 'development'

  return (
    <main className="min-h-screen bg-card dark:bg-background">
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-card p-6 shadow-lg md:p-8">
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-3xl font-bold text-foreground">Sign In</h1>
            <p className="text-muted-foreground">
              Sign in to access your account and manage your tweet streaming
              preferences
            </p>
            {redirectUrl && (
              <p className="mt-2 text-sm text-brand">
                You&apos;ll be redirected to: {decodeURIComponent(redirectUrl)}
              </p>
            )}
          </div>

          <div className="space-y-6">
            <SignIn />

            {isDev && (
              <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  <strong>Dev Mode:</strong> Clicking the button above will sign
                  you in with a test account instead of Twitter OAuth.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
