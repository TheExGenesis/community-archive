'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Zap } from 'lucide-react'

export default function QuickDevLogin() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleQuickLogin = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'dev@example.com',
          password: 'devpassword123'
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to sign in')
      }

      setSuccess(true)
      // Redirect after a brief moment to show success
      setTimeout(() => {
        window.location.href = '/profile'
      }, 1000)
    } catch (err: any) {
      console.error('Quick dev login error:', err)
      setError(err.message || 'Failed to sign in')
    } finally {
      setIsLoading(false)
    }
  }

  // Only show in development mode
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 max-w-xs">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-5 w-5 text-yellow-500" />
          <h3 className="font-semibold text-sm">Dev Mode</h3>
        </div>
        
        <Button
          onClick={handleQuickLogin}
          disabled={isLoading || success}
          variant={success ? 'default' : 'outline'}
          className="w-full"
          size="sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : success ? (
            <>✓ Success! Redirecting...</>
          ) : (
            <>Quick Dev Login</>
          )}
        </Button>

        {error && (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Instantly sign in with a test account
        </p>
      </div>
    </div>
  )
}