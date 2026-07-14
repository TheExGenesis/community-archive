'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Shield } from 'lucide-react'
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { cn } from '@/utils/tailwind'

export default function HeaderNavigation({
  isAdmin = false,
}: {
  isAdmin?: boolean
}) {
  const pathname = usePathname()

  const baseNavItems = [
    { href: '/', label: 'Home' },
    { href: '/user-dir', label: 'Directory' },
  ]

  const userNavItems = [{ href: '/profile', label: 'Profile' }]

  const navItems = [...baseNavItems, ...userNavItems]

  return (
    <NavigationMenu className="hidden md:flex">
      <NavigationMenuList>
        {navItems.map((item) => (
          <NavigationMenuItem key={item.href}>
            <Link href={item.href} legacyBehavior passHref>
              <NavigationMenuLink
                className={cn(
                  navigationMenuTriggerStyle(),
                  'transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-gray-800',
                  pathname === item.href
                    ? 'bg-gray-100 font-semibold dark:bg-gray-800' // Enhanced active style
                    : '',
                )}
              >
                {item.label}
              </NavigationMenuLink>
            </Link>
          </NavigationMenuItem>
        ))}
        {isAdmin ? (
          <NavigationMenuItem>
            <Link href="/admin" legacyBehavior passHref>
              <NavigationMenuLink
                aria-label="Admin dashboard"
                title="Admin"
                className={cn(
                  navigationMenuTriggerStyle(),
                  'w-10 px-0 hover:bg-gray-100 dark:hover:bg-gray-800',
                  pathname === '/admin'
                    ? 'bg-gray-100 font-semibold dark:bg-gray-800'
                    : '',
                )}
              >
                <Shield className="h-4 w-4" />
              </NavigationMenuLink>
            </Link>
          </NavigationMenuItem>
        ) : null}
      </NavigationMenuList>
    </NavigationMenu>
  )
}
