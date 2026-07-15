'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const navigationItems = [
  { href: '/', label: 'Home' },
  { href: '/#products', label: 'Products' },
  { href: '/user-dir', label: 'User Directory' },
  { href: '/search', label: 'Search' },
  { href: '/docs', label: 'Docs' },
]

export default function MobileNavigation() {
  const pathname = usePathname()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open navigation menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 rounded-lg p-2 lg:hidden"
      >
        <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Navigation
        </DropdownMenuLabel>
        {navigationItems.map((item) => {
          const isActive =
            item.href === '/#products'
              ? false
              : pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(`${item.href}/`))

          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`cursor-pointer py-2.5 ${
                  isActive ? 'bg-muted font-medium' : ''
                }`}
              >
                {item.label}
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
