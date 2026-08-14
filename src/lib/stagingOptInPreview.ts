import 'server-only'
import { isProductionSupabaseUrl } from '@/lib/isProductionSupabaseUrl'

export interface StagingOptInPreviewEnvironment {
  stagingDevLoginEnabled?: boolean
  supabaseUrl?: string
}

const getDefaultEnvironment = (): StagingOptInPreviewEnvironment => ({
  stagingDevLoginEnabled: process.env.ENABLE_STAGING_DEV_LOGIN === 'true',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
})

export const isStagingOptInPreviewEnabled = (
  requested: boolean,
  environment: StagingOptInPreviewEnvironment = getDefaultEnvironment(),
) =>
  requested &&
  environment.stagingDevLoginEnabled === true &&
  Boolean(environment.supabaseUrl) &&
  !isProductionSupabaseUrl(environment.supabaseUrl)
