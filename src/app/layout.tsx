import { Petrona, Manrope } from 'next/font/google'
import ThemeProvider from '@/providers/ThemeProvider'
import NextTopLoader from 'nextjs-toploader'
import { Analytics } from '@vercel/analytics/react'
import { BotIdClient } from 'botid/client'
import './globals.css'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import ReactQueryProvider from '@/providers/ReactQueryProvider'
import PostHogProvider from '@/providers/PostHogProvider'
import Image from 'next/image'
import ThemeToggle from '@/components/ThemeToggle'
import dynamic from 'next/dynamic'
import HeaderSearch from '@/components/HeaderSearch'
import MobileMenu from '@/components/MobileMenu'
import Footer from '@/components/Footer'
import HashScrollHandler from '@/components/HashScrollHandler'
import PostHogPageView from '@/components/PostHogPageView'
import PostHogLink from '@/components/PostHogLink'
import {
  AdminNavigationLink,
  AudienceHeaderNavigation,
  AudienceMobileNavigation,
  NavigationAudienceProvider,
} from '@/components/NavigationAudience'
import { BOT_ID_PROTECTED_ROUTES } from '@/lib/botIdRoutes'

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

const defaultUrl =
  process.env.VERCEL_ENV === 'production'
    ? 'https://www.community-archive.org'
    : process.env.VERCEL_URL
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
      className={`${manrope.className} ${petrona.variable} antialiased`}
      suppressHydrationWarning={true}
    >
      <head>
        <BotIdClient protect={BOT_ID_PROTECTED_ROUTES} />
      </head>
      <body className="bg-background text-foreground transition-colors duration-300">
        <NextTopLoader showSpinner={false} height={3} color="#2acf80" />
        <PostHogProvider>
          <PostHogPageView />
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <ReactQueryProvider>
              <HashScrollHandler />
              <NavigationAudienceProvider>
                <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-md">
                  <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
                    <div className="flex min-w-0 items-center gap-3">
                      <AudienceMobileNavigation />
                      <PostHogLink
                        href="/"
                        eventName="navigation_item_clicked"
                        eventProperties={{
                          destination: 'home',
                          surface: 'brand',
                          already_active: false,
                        }}
                        className="flex flex-shrink-0 items-center space-x-2"
                      >
                        <Image
                          src="/images/logo.png"
                          alt="Community Archive logo"
                          width={28}
                          height={28}
                          className="h-7 w-7 flex-shrink-0"
                          priority
                        />
                        <span
                          className="hidden whitespace-nowrap text-lg font-bold text-foreground sm:inline"
                          style={{
                            fontFamily:
                              'var(--font-petrona), Georgia, "Times New Roman", serif',
                          }}
                        >
                          Community Archive
                        </span>
                      </PostHogLink>
                      <AudienceHeaderNavigation kind="primary" />
                    </div>
                    <div className="flex flex-shrink-0 items-center space-x-3">
                      <AudienceHeaderNavigation kind="utility" />
                      <HeaderSearch />
                      <div className="text-sm">
                        <DynamicSignIn />
                      </div>
                      <ThemeToggle side="bottom" />
                      <AdminNavigationLink />
                      <MobileMenu />
                    </div>
                  </div>
                </header>
              </NavigationAudienceProvider>
              <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
                {children}
                <Analytics />
                <Footer />
              </div>
              <ReactQueryDevtools initialIsOpen={false} />
            </ReactQueryProvider>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
