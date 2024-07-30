import Header from '@/components/Header'
import ThemeToggle from '@/components/ThemeToggle'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)
  const { data: dev_tweets } = await supabase.from('dev_tweets').select()

  return (
    <div className="flex w-full flex-1 flex-col items-center gap-20">
      <nav className="flex h-16 w-full justify-center border-b border-b-foreground/10">
        <div className="flex w-full max-w-4xl items-center justify-between p-3 text-sm"></div>
      </nav>

      <div className="flex max-w-4xl flex-1 flex-col gap-20 px-3">
        <Header />
        <main className="flex flex-1 flex-col gap-6">
          <h2 className="mb-4 text-4xl font-bold">Next steps</h2>
          <pre>{JSON.stringify(dev_tweets, null, 2)}</pre>
        </main>
      </div>

      <footer className="w-full justify-center border-t border-t-foreground/10 p-8 text-center text-xs">
        <p className="mb-6">
          Powered by{' '}
          <a
            href="https://supabase.com/?utm_source=create-next-app&utm_medium=template&utm_term=nextjs"
            target="_blank"
            className="font-bold hover:underline"
            rel="noreferrer"
          >
            Supabase
          </a>
        </p>
        <ThemeToggle />
      </footer>
    </div>
  )
}
