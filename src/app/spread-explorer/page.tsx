import SpreadExplorer from './SpreadExplorer'

export const metadata = {
  title: 'Spread explorer',
  description:
    'How any word spread across the TPOT hex map, month by month from 2022.',
  robots: { index: false, follow: false },
}

// Unlisted: open to anyone with the link, absent from the navigation for
// non-admins and from search engines. The page is static; its data comes from
// the edge-cached static export behind /api/spread-explorer/*.
export default function SpreadExplorerPage() {
  return <SpreadExplorer />
}
