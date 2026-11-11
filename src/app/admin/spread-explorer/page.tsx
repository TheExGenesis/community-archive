import { requireSpreadExplorerViewer } from './access'
import SpreadExplorer from './SpreadExplorer'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Spread explorer',
  robots: { index: false, follow: false },
}

// Private admin page: how a word spreads over the TPOT hex map (real usage only).
// Data comes from the static export behind /api/admin/spread-explorer/*.
export default async function SpreadExplorerPage() {
  await requireSpreadExplorerViewer()
  return <SpreadExplorer />
}
