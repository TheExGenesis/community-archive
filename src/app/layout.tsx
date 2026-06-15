import { Petrona, Manrope } from 'next/font/google'
import ThemeProvider from '@/providers/ThemeProvider'
import NextTopLoader from 'nextjs-toploader'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import ReactQueryProvider from '@/providers/ReactQueryProvider'
import Link from 'next/link'
import Image from 'next/image'
import ThemeToggle from '@/components/ThemeToggle'
import dynamic from 'next/dynamic'
import HeaderNavigation from '@/components/HeaderNavigation'
import HeaderSearch from '@/components/HeaderSearch'
import MobileMenu from '@/components/MobileMenu'
import { checkIsAdmin } from '@/app/admin/data'

const DynamicSignIn = dynamic(() => import('@/components/SignIn'), {
  ssr: false,
})

// Headings use Petrona (serif); body uses Manrope (sans).
const petrona = Petrona({
  subsets: ['latin'],
  variable: '--font-petrona',
  display: 'swap',
})
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: 'Community Archive',
  description: "A public archive of everyone's tweets ",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isAdmin = await checkIsAdmin()
  return (
    <html
      lang="en"
      className={`${manrope.className} ${petrona.variable} antialiased`}
      style={{ colorScheme: 'dark' }}
      suppressHydrationWarning={true}
    >
      <body className="bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 transition-colors duration-300">
        <NextTopLoader showSpinner={false} height={3} color="#2acf80" />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <ReactQueryProvider>
            <header className="sticky top-0 z-50 w-full border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
              <div className="container mx-auto flex h-16 max-w-screen-xl items-center justify-between px-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex items-center space-x-2 flex-shrink-0">
                  <Image
                    src="/images/logo.png"
                    alt="Community Archive logo"
                    width={28}
                    height={28}
                    className="h-7 w-7 flex-shrink-0 rounded-full"
                    priority
                  />
                  <span
                    className="font-bold text-lg text-gray-800 dark:text-gray-200 whitespace-nowrap"
                    style={{ fontFamily: 'var(--font-petrona), Georgia, "Times New Roman", serif' }}
                  >
                    Community Archive
                  </span>
                </Link>
                <HeaderNavigation isAdmin={isAdmin} />
                <div className="flex items-center space-x-3">
                  <HeaderSearch />
                </div>
                <div className="flex items-center space-x-3">
                  <ThemeToggle side="bottom" />
                  <div className="text-sm">
                    <DynamicSignIn />
                  </div>
                  <MobileMenu isAdmin={isAdmin} />
                </div>
              </div>
            </header>
            <main className="flex min-h-[calc(100vh-4rem)] flex-col">
              {children}
              <Analytics />
            </main>
            <ReactQueryDevtools initialIsOpen={false} />
          </ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
