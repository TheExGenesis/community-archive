'use client'
import ThemeToggle from '@/components/ThemeToggle'
import SearchTweets from '@/components/SearchTweets'
import AdvancedSearchForm from '@/components/AdvancedSearchForm'

export default function SearchTweetsPage() {
  return (
    <div className="flex w-full flex-1 flex-col items-center gap-20">
      <nav className="flex h-16 w-full justify-center border-b border-b-foreground/10">
        <div className="flex w-full max-w-4xl items-center justify-between p-3 text-sm"></div>
      </nav>

      <div className="flex max-w-4xl flex-1 flex-col gap-20 px-3">
        <main className="flex flex-1 flex-col gap-6">
          <h2 className="mb-4 text-4xl font-bold">Advanced Search</h2>
          <AdvancedSearchForm />
          {/* <SearchTweets supabase={null} /> */}
        </main>
      </div>
      <footer className="w-full justify-center border-t border-t-foreground/10 p-8 text-center text-xs">
        <ThemeToggle />
      </footer>
    </div>
  )
}
