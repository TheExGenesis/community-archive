'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface OptInFormProps {
  userId: string
  userEmail: string
  initialOptInStatus: any
}

export default function OptInForm({ userId, userEmail, initialOptInStatus }: OptInFormProps) {
  const router = useRouter()
  const [isOptedIn, setIsOptedIn] = useState(initialOptInStatus?.opted_in || false)
  const [username, setUsername] = useState(initialOptInStatus?.username || '')
  const [twitterUserId, setTwitterUserId] = useState(initialOptInStatus?.twitter_user_id || '')
  const [agreeToTerms, setAgreeToTerms] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!isOptedIn && !agreeToTerms) {
      setError('You must agree to the terms and conditions to opt in')
      return
    }

    if (!username.trim()) {
      setError('Twitter/X username is required')
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
          username: username.trim().replace('@', ''), // Remove @ if present
          twitterUserId: twitterUserId.trim() || null,
          optedIn: !isOptedIn, // Toggle the status
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
      
      // Reset the terms checkbox
      setAgreeToTerms(false)
      
      // Refresh the page data
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label htmlFor="username" className="text-gray-700 dark:text-gray-300">
          Twitter/X Username <span className="text-red-500">*</span>
        </Label>
        <Input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="your_username"
          className="mt-1"
          disabled={isLoading || (initialOptInStatus && isOptedIn)}
          required
        />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Enter your Twitter/X username without the @ symbol
        </p>
      </div>

      <div>
        <Label htmlFor="twitterUserId" className="text-gray-700 dark:text-gray-300">
          Twitter/X User ID (Optional)
        </Label>
        <Input
          id="twitterUserId"
          type="text"
          value={twitterUserId}
          onChange={(e) => setTwitterUserId(e.target.value)}
          placeholder="1234567890"
          className="mt-1"
          disabled={isLoading || (initialOptInStatus && isOptedIn)}
        />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Your numeric Twitter/X user ID (optional, helps with matching)
        </p>
      </div>

      {!isOptedIn && (
        <div className="flex items-start space-x-2">
          <Checkbox
            id="terms"
            checked={agreeToTerms}
            onCheckedChange={(checked) => setAgreeToTerms(checked as boolean)}
            disabled={isLoading}
            className="mt-1"
          />
          <Label 
            htmlFor="terms" 
            className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
          >
            I have read and agree to the Terms and Conditions and Privacy Policy. 
            I understand that my public tweets will be archived and may persist even 
            after deletion from Twitter/X.
          </Label>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-900/20">
          <AlertDescription className="text-green-800 dark:text-green-200">
            {success}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between pt-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Current Status: 
          <span className={`ml-2 font-semibold ${isOptedIn ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-500'}`}>
            {isOptedIn ? '✓ Opted In' : '✗ Not Opted In'}
          </span>
        </div>
        
        <Button
          type="submit"
          disabled={isLoading || (!isOptedIn && !agreeToTerms) || !username.trim()}
          variant={isOptedIn ? 'destructive' : 'default'}
        >
          {isLoading ? 'Processing...' : (isOptedIn ? 'Opt Out' : 'Opt In')}
        </Button>
      </div>

      {isOptedIn && (
        <p className="text-sm text-yellow-600 dark:text-yellow-400">
          Note: Opting out will stop future tweet collection, but tweets already 
          archived will remain unless you delete them manually.
        </p>
      )}
    </form>
  )
}