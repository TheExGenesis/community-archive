'use client'
import { useState } from 'react'
import { createBrowserClient } from '@/utils/supabase'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'

interface DevSignInProps {
  redirectUrl?: string
}

export default function DevSignIn({ redirectUrl }: DevSignInProps) {
  const [email, setEmail] = useState('dev@example.com')
  const [password, setPassword] = useState('devpassword123')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleDevSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      // Use the dev-login API endpoint
      const response = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to sign in')
      }

      // Successfully signed in - redirect or refresh
      if (redirectUrl) {
        window.location.href = redirectUrl
      } else {
        window.location.href = '/profile'
      }
    } catch (err: any) {
      console.error('Dev sign in error:', err)
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
    <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
      <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-3">
        Developer Sign In
      </h3>
      <form onSubmit={handleDevSignIn} className="space-y-3">
        <div>
          <Label htmlFor="dev-email" className="text-xs">Email</Label>
          <Input
            id="dev-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="dev@example.com"
            className="h-8 text-sm"
            disabled={isLoading}
          />
        </div>
        <div>
          <Label htmlFor="dev-password" className="text-xs">Password</Label>
          <Input
            id="dev-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="h-8 text-sm"
            disabled={isLoading}
          />
        </div>
        
        <Button
          type="submit"
          className="w-full h-8 text-sm"
          variant="outline"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign in as Developer'
          )}
        </Button>
      </form>
      
      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}
      
      <p className="text-xs text-yellow-800 dark:text-yellow-200 mt-3">
        This creates/uses a test account for development. The account will persist in the database.
      </p>
    </div>
  )
}