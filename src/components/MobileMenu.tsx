'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { LogIn, LogOut, Menu as MenuIcon, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { createBrowserClient } from '@/utils/supabase'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const baseNavItems = [
  { href: '/', label: 'Home' },
  { href: '/#products', label: 'Products' },
  { href: '/user-dir', label: 'User Directory' },
  { href: '/search', label: 'Search' },
]

export default function MobileMenu() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const { userMetadata } = useAuthAndArchive()

  const navItems = baseNavItems

  const handleSignOut = async () => {
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signOut()

    if (!error) {
      setIsOpen(false)
      window.location.href = '/'
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon">
          <MenuIcon className="h-5 w-5" />
          <span className="sr-only">Open account menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-xs sm:max-w-sm">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-left text-lg font-semibold">
            Menu
          </SheetTitle>
          <SheetDescription className="sr-only">
            Browse Community Archive pages.
          </SheetDescription>
        </SheetHeader>
        <div className="flex h-[calc(100%-3rem)] flex-col">
          <nav className="flex flex-col space-y-2 lg:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-base font-medium transition-colors duration-150
                  ${
                    pathname === item.href
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                onClick={() => setIsOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="my-3 border-t" />
          </nav>

          <div className="flex flex-col space-y-2">
            {userMetadata ? (
              <>
                <Link
                  href="/profile"
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium text-foreground transition-colors hover:bg-accent"
                  onClick={() => setIsOpen(false)}
                >
                  <UserRound className="h-5 w-5" />
                  Profile
                </Link>
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-left text-base font-medium text-foreground transition-colors hover:bg-accent"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-5 w-5" />
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium text-foreground transition-colors hover:bg-accent"
                onClick={() => setIsOpen(false)}
              >
                <LogIn className="h-5 w-5" />
                Sign in
              </Link>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
