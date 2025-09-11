import { GeistSans } from 'geist/font/sans'
import ThemeProvider from '@/providers/ThemeProvider'
import NextTopLoader from 'nextjs-toploader'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import ReactQueryProvider from '@/providers/ReactQueryProvider'
import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'
import dynamic from 'next/dynamic'
import HeaderNavigation from '@/components/HeaderNavigation'
import MobileMenu from '@/components/MobileMenu'

const DynamicSignIn = dynamic(() => import('@/components/SignIn'), {
  ssr: false,
})

const DynamicQuickDevLogin = dynamic(() => import('@/components/QuickDevLogin'), {
  ssr: false,
})

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: 'Community Archive',
  description: "A public archive of everyone's tweets ",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.className} antialiased`}
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
                <Link href="/" className="flex items-center space-x-2">
                  <span className="font-bold text-lg text-gray-800 dark:text-gray-200">Community Archive</span>
                </Link>
                <HeaderNavigation />
                <div className="flex items-center space-x-3">
                  <ThemeToggle side="bottom" />
                  <div className="text-sm">
                    <DynamicSignIn />
                  </div>
                  <MobileMenu />
                </div>
              </div>
            </header>
            <main className="flex min-h-[calc(100vh-4rem)] flex-col">
              {children}
              <Analytics />
            </main>
            <DynamicQuickDevLogin />
            <ReactQueryDevtools initialIsOpen={false} />
          </ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
