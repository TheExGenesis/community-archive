import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/utils/supabase'
import { getSchemaName, getTableName } from '@/lib-client/getTableName'

export function useAuthAndArchive() {
  const [userMetadata, setUserMetadata] = useState<any>(null)
  const [isArchiveUploaded, setIsArchiveUploaded] = useState(false)

  useEffect(() => {
    const supabase = createBrowserClient()
    if (
      process.env.NODE_ENV !== 'production' &&
      typeof window !== 'undefined'
    ) {
      window.supabase = supabase
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user.user_metadata) {
        setUserMetadata(session.user.user_metadata)
        console.log('session.user.user_metadata', session.user.user_metadata)
      } else {
        setUserMetadata(null)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user.user_metadata) {
        setUserMetadata(session.user.user_metadata)
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
        .schema(getSchemaName())
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
