// Sourced from the package.json `gen-types` script. This is intentionally a
// string literal (not env-driven), so an environment change cannot disable the
// production safety guard that uses it.
const PRODUCTION_SUPABASE_PROJECT_REF = 'fabxmporizzqflnftavs'

export const isProductionSupabaseUrl = (url: string | undefined) =>
  url?.includes(PRODUCTION_SUPABASE_PROJECT_REF) ?? false
