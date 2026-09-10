import Link from 'next/link'
import { requireAdmin } from '../data'
import { KeywordDashboard } from './KeywordDashboard'
export const dynamic = 'force-dynamic'
export default async function KeywordsPage() {
  await requireAdmin()
  return (
    <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-8">
      <Link href="/admin" className="text-sm text-brand hover:underline">
        ← Admin
      </Link>
      <div>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">
          Private admin · live member data
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Keyword lab</h1>
        <p className="mt-2 text-muted-foreground">
          Explore the conversations gaining momentum. These controls preview
          rankings; the homepage uses the shipped defaults.
        </p>
      </div>
      <KeywordDashboard />
    </main>
  )
}
