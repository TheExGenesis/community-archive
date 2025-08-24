'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'

interface OptInFormProps {
  userId: string
  userEmail: string
  initialOptInStatus: any
}

export default function OptInForm({ userId, userEmail, initialOptInStatus }: OptInFormProps) {
  const router = useRouter()
  const { userMetadata } = useAuthAndArchive()
  const [isOptedIn, setIsOptedIn] = useState(initialOptInStatus?.opted_in || false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Get Twitter info from authenticated user metadata
  const twitterUsername = userMetadata?.user_name
  const twitterUserId = userMetadata?.provider_id

  const handleSubmit = async () => {
    setError('')
    setSuccess('')

    if (!twitterUsername) {
      setError('Twitter username not found. Please make sure you signed in with Twitter.')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/opt-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          username: twitterUsername.toLowerCase(),
          twitterUserId: twitterUserId || null,
          optedIn: !isOptedIn,
          termsVersion: 'v1.0'
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update opt-in status')
      }

      setIsOptedIn(!isOptedIn)
      setSuccess(
        !isOptedIn 
          ? 'Successfully opted in to tweet streaming!' 
          : 'Successfully opted out of tweet streaming.'
      )
      
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!twitterUsername) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <p className="text-red-800 dark:text-red-200">
          No Twitter account found. Please sign in with Twitter to use the opt-in feature.
        </p>
      </div>
    )
  }

  return (
    <div className="text-center space-y-8">
      {/* Display current Twitter account */}
      <div className="inline-block p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
          Signed in as
        </h3>
        <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
          @{twitterUsername}
        </p>
        {twitterUserId && (
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
            ID: {twitterUserId}
          </p>
        )}
      </div>

      {/* Current status with large visual indicator */}
      <div>
        <div className="mb-6">
          <span className="text-gray-600 dark:text-gray-400">Current Status:</span>
        </div>
        <div className={`inline-block px-8 py-4 rounded-full text-2xl font-bold ${
          isOptedIn 
            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-2 border-green-300 dark:border-green-700' 
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-2 border-gray-300 dark:border-gray-600'
        }`}>
          {isOptedIn ? '✓ Opted In' : '✗ Not Opted In'}
        </div>
      </div>

      {/* Error and success messages */}
      {error && (
        <Alert variant="destructive" className="max-w-md mx-auto">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-900/20 max-w-md mx-auto">
          <AlertDescription className="text-green-800 dark:text-green-200">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {/* Big center stage opt in/out button */}
      <div className="py-8">
        <Button
          onClick={handleSubmit}
          disabled={isLoading}
          variant={isOptedIn ? 'destructive' : 'default'}
          size="lg"
          className="px-12 py-6 text-xl font-semibold min-w-[280px]"
        >
          {isLoading ? 'Processing...' : (isOptedIn ? 'Opt Out' : 'Opt In to Tweet Streaming')}
        </Button>
      </div>

      {/* Warning for opted-in users */}
      {isOptedIn && (
        <div className="max-w-md mx-auto p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Note:</strong> Opting out will stop future tweet collection, but tweets already 
            archived will remain unless you delete them manually.
          </p>
        </div>
      )}
    </div>
  )
}