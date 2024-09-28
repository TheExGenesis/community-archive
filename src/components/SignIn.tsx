'use client'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { createBrowserClient } from '@/utils/supabase'

export default function SignIn() {
  const { userMetadata, isArchiveUploaded } = useAuthAndArchive()

  const signInWithTwitter = async () => {
    const supabase = createBrowserClient()

    console.log('sign in with twitter', {
      userMetadata,
      origin: window.location.origin,
    })
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'twitter',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })
    console.log({ data, error })

    if (error) {
      console.error('Error signing in with Twitter:', error)
    }
  }

  const handleSignOut = async () => {
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signOut()
    console.log('sign out', { error })
    if (!error) {
      window.location.reload()
    }
  }

  return userMetadata ? (
    <div className="inline-flex items-center dark:text-gray-300">
      <span>{`You're logged in as ${
        userMetadata.full_name || userMetadata.user_name
      } `}</span>
      <form action={handleSignOut} className="ml-2 inline-block">
        <button type="submit" className="hover:underline dark:text-blue-400">
          (Sign Out)
        </button>
      </form>
    </div>
  ) : (
    <div className="dark:text-gray-300">
      <form action={signInWithTwitter} className="inline-block">
        <button
          type="submit"
          className="text-blue-500 hover:underline dark:text-blue-400"
        >
          Sign in with Twitter
        </button>
      </form>
      <span className="ml-1">to upload your archive</span>
    </div>
  )
}
