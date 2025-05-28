import { SupabaseClient } from '@supabase/supabase-js'

export const refreshSession = async (supabase: SupabaseClient) => {
  try {
    const { data: refreshdata, error: refreshError } =
      await supabase.auth.refreshSession()
    if (refreshError) {
      console.error('Error refreshing session:', refreshError)
      throw refreshError
    }
    console.log('Refreshed session:', refreshdata)
  } catch (error) {
    if (error instanceof Error && error.message === 'Auth session missing!') {
      console.warn('Warning: Auth session missing!')
    } else {
      throw error
    }
  }
}
