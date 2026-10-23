import { usePreviewSession } from '@/components/PreviewSession'
import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { createBrowserClient } from '@/utils/supabase'
import { getTableName } from '@/lib/getTableName'
import { getAccountIdentity, getTwitterAvatarUrl } from '@/lib/twitterIdentity'

export interface SessionAccount {
  provider_id: string | null
  user_name: string | null
  avatar_url: string | null
}

// Built only from the Twitter/X identity and server-written app_metadata.
// user_metadata is client-writable, so it never supplies these fields.
export const toSessionAccount = (user: User | null): SessionAccount | null => {
  if (!user) return null

  const { providerId, username } = getAccountIdentity(user)
  return {
    provider_id: providerId,
    user_name: username,
    avatar_url: getTwitterAvatarUrl(user),
  }
}

export function useAuthAndArchive() {
  const preview = usePreviewSession()
  const [userMetadata, setUserMetadata] = useState<SessionAccount | null>(null)
  const [isArchiveUploaded, setIsArchiveUploaded] = useState(false)

  useEffect(() => {
    const supabase = createBrowserClient()
    // console.log('supabase', { supabase, node_env: process.env.NODE_ENV })
    if (
      process.env.NODE_ENV !== 'production' &&
      typeof window !== 'undefined'
    ) {
      window.supabase = supabase
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserMetadata(toSessionAccount(session.user))
      } else {
        setUserMetadata(null)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserMetadata(toSessionAccount(session.user))
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const checkArchiveUpload = async () => {
      const accountId = userMetadata?.provider_id
      if (!accountId) return

      const supabase = createBrowserClient()
      const { data, error } = await supabase
        .schema('public')
        .from(getTableName('archive_upload') as 'archive_upload')
        .select('id')
        .eq('account_id', accountId)
        .limit(1)

      if (error) {
        console.error('Error checking archive upload:', error)
        return
      }

      setIsArchiveUploaded(data.length > 0)
    }

    checkArchiveUpload()
  }, [userMetadata])

  if (preview.enabled && preview.view !== 'actual')
    return {
      userMetadata:
        preview.view === 'signed-in'
          ? { user_name: 'preview_user', provider_id: null, avatar_url: null }
          : null,
      isArchiveUploaded: false,
    }
  return { userMetadata, isArchiveUploaded }
}
