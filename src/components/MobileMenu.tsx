'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogIn, LogOut, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthAndArchive } from '@/hooks/useAuthAndArchive'
import { createBrowserClient } from '@/utils/supabase'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const mobileNavItems = [
  { href: '/', label: 'Home' },
  { href: '/#products', label: 'Products' },
  { href: '/user-dir', label: 'User Directory' },
  { href: '/search', label: 'Search' },
]

export default function MobileMenu() {
  const pathname = usePathname()
  const { userMetadata } = useAuthAndArchive()

  const handleSignOut = async () => {
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signOut()

    if (!error) {
      window.location.href = '/'
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <UserRound className="h-5 w-5" />
          <span className="sr-only">Open account menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 rounded-lg p-2"
      >
        <div className="lg:hidden">
          <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Navigation
          </DropdownMenuLabel>
          {mobileNavItems.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                className={`cursor-pointer py-2.5 ${
                  pathname === item.href ? 'bg-muted font-medium' : ''
                }`}
              >
                {item.label}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
        </div>

        {userMetadata ? (
          <>
            <DropdownMenuItem asChild>
              <Link href="/profile" className="cursor-pointer gap-3 py-2.5">
                <UserRound className="h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer gap-3 py-2.5"
              onSelect={() => void handleSignOut()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/login" className="cursor-pointer gap-3 py-2.5">
              <LogIn className="h-4 w-4" />
              Sign in
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
