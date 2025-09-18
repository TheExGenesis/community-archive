'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu as MenuIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const baseNavItems = [
  { href: '/', label: 'Home' },
  { href: '/user-dir', label: 'User Directory' },
  { href: '/search', label: 'Advanced Search' },
]

const streamingNavItems = [
  { href: '/stream-monitor', label: 'Stream Monitor' },
]

const userNavItems = [
  { href: '/profile', label: 'Profile' },
]

export default function MobileMenu() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  // Include all navigation items including streaming features
  const navItems = [...baseNavItems, ...streamingNavItems, ...userNavItems]

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <MenuIcon className="h-6 w-6" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full max-w-xs sm:max-w-sm">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-left text-lg font-semibold">Navigation</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-base font-medium transition-colors duration-150
                ${
                  pathname === item.href
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              onClick={() => setIsOpen(false)} // Close sheet on link click
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
} 