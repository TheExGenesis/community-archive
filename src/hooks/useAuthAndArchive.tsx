import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { createBrowserClient } from '@/utils/supabase'
import { getTableName } from '@/lib/getTableName'

const normalizeUserMetadata = (user: User | null) => {
  if (!user) return null

  const userMeta = user.user_metadata ?? {}
  const appMeta = user.app_metadata ?? {}
  const identities = user.identities ?? []
  const twitterIdentity = identities.find((identity) => identity.provider === 'twitter')
  const identityData = twitterIdentity?.identity_data ?? {}

  const providerId =
    userMeta.provider_id ??
    appMeta.provider_id ??
    identityData.provider_id ??
    identityData.sub ??
    identityData.user_id ??
    identityData.id

  const userName =
    userMeta.user_name ??
    appMeta.user_name ??
    identityData.user_name ??
    identityData.preferred_username ??
    identityData.username ??
    identityData.screen_name

  const normalized = { ...userMeta, ...appMeta }

  if (providerId) {
    normalized.provider_id = providerId
  }
  if (userName) {
    normalized.user_name = userName
  }

  return normalized
}

export function useAuthAndArchive() {
  const [userMetadata, setUserMetadata] = useState<any>(null)
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
        setUserMetadata(normalizeUserMetadata(session.user))
      } else {
        setUserMetadata(null)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserMetadata(normalizeUserMetadata(session.user))
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const checkArchiveUpload = async () => {
      if (!userMetadata?.provider_id) return

      const supabase = createBrowserClient()
      const { data, error } = await supabase
        .schema('public')
        .from(getTableName('archive_upload') as 'archive_upload')
        .select('id')
        .eq('account_id', userMetadata.provider_id)
        .limit(1)

      if (error) {
        console.error('Error checking archive upload:', error)
        return
      }

      setIsArchiveUploaded(data.length > 0)
    }

    checkArchiveUpload()
  }, [userMetadata])

  return { userMetadata, isArchiveUploaded }
}
