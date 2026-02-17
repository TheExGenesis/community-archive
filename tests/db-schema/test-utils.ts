import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Use untyped client for schema tests - we're testing functions that may
// not be in the generated types yet (like new RPC functions)
export const createSchemaTestClient = (): SupabaseClient => {
  const useRemoteDevDb = process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true'

  const url = useRemoteDevDb
    ? process.env.NEXT_PUBLIC_SUPABASE_URL!
    : process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL!

  const serviceRole = useRemoteDevDb
    ? process.env.SUPABASE_SERVICE_ROLE!
    : process.env.NEXT_PUBLIC_LOCAL_SERVICE_ROLE!

  if (!url || !serviceRole) {
    throw new Error('Missing required environment variables for schema test client')
  }

  return createClient(url, serviceRole)
}

/**
 * Check that a table exists and is queryable by selecting 0 rows.
 */
export const tableExists = async (
  supabase: SupabaseClient,
  tableName: string,
): Promise<boolean> => {
  const { error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true })
  return !error
}

/**
 * Check that a view exists and returns the expected columns.
 */
export const viewHasColumns = async (
  supabase: SupabaseClient,
  viewName: string,
  expectedColumns: string[],
): Promise<{ exists: boolean; missingColumns: string[] }> => {
  const { data, error } = await supabase
    .from(viewName)
    .select('*')
    .limit(1)

  if (error) {
    return { exists: false, missingColumns: expectedColumns }
  }

  if (!data || data.length === 0) {
    return { exists: true, missingColumns: [] }
  }

  const returnedColumns = Object.keys(data[0])
  const missing = expectedColumns.filter((col) => !returnedColumns.includes(col))
  return { exists: true, missingColumns: missing }
}

/**
 * Check that an RPC function exists and is callable.
 */
export const rpcCallable = async (
  supabase: SupabaseClient,
  functionName: string,
  args: Record<string, any>,
): Promise<{ callable: boolean; error?: string }> => {
  const { error } = await supabase.rpc(functionName, args)
  if (error && (error.message.includes('does not exist') || error.message.includes('Could not find'))) {
    return { callable: false, error: error.message }
  }
  return { callable: true }
}
