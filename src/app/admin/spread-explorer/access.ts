import 'server-only'
import { checkIsAdmin, requireAdmin } from '@/app/admin/data'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'

// The explorer only reads, so the localhost admin preview (`pnpm dev` on
// loopback only; see src/lib/localAdminPreview.ts) may open it without a
// real session. Anything that writes must keep using requireAdmin.
export async function canViewSpreadExplorer() {
  if ((await getLocalAdminPreview()) === 'admin') return true
  return checkIsAdmin()
}

export async function requireSpreadExplorerViewer() {
  if ((await getLocalAdminPreview()) === 'admin') return
  await requireAdmin('/admin/spread-explorer')
}
