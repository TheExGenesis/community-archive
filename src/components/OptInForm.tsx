'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

      {/* Current status as simple text */}
      <div className="text-center">
        <p className="text-lg text-gray-700 dark:text-gray-300">
          Current Status: <span className={`font-semibold ${
            isOptedIn ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'
          }`}>
            {isOptedIn ? 'Opted In' : 'Not Opted In'}
          </span>
        </p>
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

      {/* Main action area */}
      <div className="py-8">
        {!isOptedIn ? (
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            size="lg"
            className="px-12 py-6 text-xl font-semibold min-w-[280px]"
          >
            {isLoading ? 'Processing...' : 'Opt In to Tweet Streaming'}
          </Button>
        ) : (
          <div className="space-y-4">
            <p className="text-lg text-green-600 dark:text-green-400 font-semibold">
              ✓ You're opted in to tweet streaming!
            </p>
            <Link href="/profile">
              <Button variant="outline" size="lg" className="px-8 py-3">
                Manage Privacy Settings
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}