import { createBrowserClient } from '@/utils/supabase'

export default function SignIn({ userMetadata }: { userMetadata: any }) {
  const signInWithTwitter = async () => {
    const supabase = createBrowserClient()
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
    <div className="mb-2 text-gray-500">
      <p>
        {"You're logged in as"}
        {userMetadata.full_name || userMetadata.user_name}
      </p>
      <form action={handleSignOut}>
        <button type="submit" className="underline">
          Sign Out
        </button>
      </form>
    </div>
  ) : (
    <>
      <div className="mb-2 flex items-center">
        <form action={signInWithTwitter} className="mr-2">
          <button type="submit" className="underline">
            {'Sign in with Twitter'}
          </button>
        </form>
        <p className="text-gray-500">{'to upload your archive'}</p>
      </div>
    </>
  )
}
