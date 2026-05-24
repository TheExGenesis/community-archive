/**
 * Shared Supabase environment configuration.
 *
 * This module is consumed by both the Next.js app (`src/utils/supabase.ts`)
 * and the standalone archive-processing worker
 * (`services/process_archive/process_archive_upload.ts`). Keeping it in
 * `src/utils/` works because the worker's Dockerfile copies the entire `src`
 * tree into the image (see `services/process_archive/Dockerfile`).
 *
 * Any env-var schema change (renaming a key, switching local vs remote
 * resolution, etc.) should land here once and apply to both consumers.
 */

export interface SupabaseConfig {
  url: string
  anonKey: string
  serviceRole?: string
}

/**
 * Resolve the Supabase URL + keys for the current environment.
 *
 * In development with `NEXT_PUBLIC_USE_REMOTE_DEV_DB !== 'true'`, the local
 * Supabase keys are used; otherwise the remote keys are used. Pass
 * `includeServiceRole: true` to also resolve the service-role key (required
 * for admin clients and the worker).
 */
export const getSupabaseConfig = (
  includeServiceRole: boolean = false,
): SupabaseConfig => {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const useRemoteDevDb = process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true'

  const getUrl = () =>
    isDevelopment && !useRemoteDevDb
      ? process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL!
      : process.env.NEXT_PUBLIC_SUPABASE_URL!

  const getAnonKey = () =>
    isDevelopment && !useRemoteDevDb
      ? process.env.NEXT_PUBLIC_LOCAL_ANON_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const getServiceRole = () =>
    isDevelopment && !useRemoteDevDb
      ? process.env.NEXT_PUBLIC_LOCAL_SERVICE_ROLE!
      : process.env.SUPABASE_SERVICE_ROLE!

  const config: SupabaseConfig = {
    url: getUrl(),
    anonKey: getAnonKey(),
    ...(includeServiceRole ? { serviceRole: getServiceRole() } : {}),
  }

  return config
}
