// The search page is a client component, so its metadata lives here.
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
  return children
}
