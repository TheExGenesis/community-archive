'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Clock,
  History,
  Home,
  Info,
  LayoutGrid,
  ListVideo,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react'
import { TubeProvider, useTube } from './TubeProvider'

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/tube', label: 'Home', icon: Home },
  { href: '/tube/liked', label: 'Liked', icon: ThumbsUp },
  { href: '/tube/history', label: 'History', icon: History },
  { href: '/tube/later', label: 'Watch later', icon: Clock },
  { href: '/tube/categories', label: 'Categories', icon: LayoutGrid },
  { href: '/tube/playlists', label: 'Playlists', icon: ListVideo },
]

const NAV_FOOT: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/tube/about', label: 'About', icon: Info },
  { href: '/tube/settings', label: 'Settings', icon: Settings },
]

/**
 * CA Tube's own full-screen frame. It covers the site header and footer so
 * the page reads as its own app; the sidebar keeps a way back to the archive.
 */
export function TubeShell({ children }: { children: ReactNode }) {
  return (
    <TubeProvider>
      <Frame>{children}</Frame>
    </TubeProvider>
  )
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background text-foreground">
      <TopBar onMenu={() => setOpen((o) => !o)} />
      <div className="flex min-h-0 flex-1">
        <aside
          className={`${
            open ? 'flex' : 'hidden'
          } absolute inset-y-14 left-0 z-10 w-60 flex-col overflow-y-auto border-r border-border bg-background px-3 py-3 shadow-lg md:static md:flex md:shadow-none`}
        >
          <Sidebar pathname={pathname} />
        </aside>
        <main id="tube-scroll" className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [q, setQ] = useState('')
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    if (pathname === '/tube') setQ(params.get('q') ?? '')
  }, [pathname, params])

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-4">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Menu"
        className="rounded-full p-2 hover:bg-muted md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link href="/tube" className="flex shrink-0 items-center gap-1.5">
        <span className="flex h-6 w-8 items-center justify-center rounded-md bg-brand text-brand-foreground">
          <svg viewBox="0 0 10 10" className="h-3 w-3 fill-current" aria-hidden>
            <path d="M2 1l7 4-7 4z" />
          </svg>
        </span>
        <span
          className="hidden text-lg font-semibold tracking-tight sm:inline"
          style={{ fontFamily: 'var(--font-petrona), Georgia, serif' }}
        >
          CA Tube
        </span>
      </Link>
      <form
        className="mx-auto flex w-full min-w-0 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault()
          const next = new URLSearchParams(pathname === '/tube' ? params : '')
          if (q.trim()) next.set('q', q.trim())
          else next.delete('q')
          const s = next.toString()
          router.push(`/tube${s ? `?${s}` : ''}`)
        }}
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="h-10 min-w-0 flex-1 rounded-l-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground/40"
        />
        <button
          type="submit"
          aria-label="Search"
          className="flex h-10 w-14 items-center justify-center rounded-r-full border border-l-0 border-border bg-muted hover:bg-muted/70"
        >
          <Search className="h-4 w-4" />
        </button>
      </form>
      <button
        type="button"
        aria-label="Toggle dark mode"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        className="shrink-0 rounded-full p-2 hover:bg-muted"
      >
        <Sun className="hidden h-5 w-5 dark:block" />
        <Moon className="h-5 w-5 dark:hidden" />
      </button>
    </header>
  )
}

function Sidebar({ pathname }: { pathname: string }) {
  const { state } = useTube()
  const counts: Record<string, number> = {
    '/tube/liked': state.liked.length,
    '/tube/later': state.later.length,
  }
  const item = ({ href, label, icon: Icon }: (typeof NAV)[number]) => {
    const active =
      href === '/tube'
        ? pathname === '/tube' || pathname.startsWith('/tube/watch')
        : pathname.startsWith(href)
    return (
      <Link
        key={href}
        href={href}
        className={`flex items-center gap-4 rounded-lg px-3 py-2 text-sm ${
          active ? 'bg-muted font-medium' : 'hover:bg-muted/60'
        }`}
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
        <span className="flex-1">{label}</span>
        {counts[href] ? (
          <span className="text-xs text-muted-foreground">{counts[href]}</span>
        ) : null}
      </Link>
    )
  }
  return (
    <nav className="flex flex-1 flex-col gap-0.5">
      {NAV.map(item)}
      <div className="my-3 border-t border-border" />
      {NAV_FOOT.map(item)}
      <div className="mt-auto pt-6">
        <Link
          href="/"
          className="flex items-center gap-4 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5 shrink-0" strokeWidth={1.75} />
          Community Archive
        </Link>
      </div>
    </nav>
  )
}
