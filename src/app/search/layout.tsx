export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Search · Community Archive',
  description:
    'Search the full text of tweets shared with Community Archive by keyword, author, and date.',
}

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
