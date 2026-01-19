'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'

export default function HeaderNavigation() {
  const pathname = usePathname()

  const baseNavItems = [
    { href: '/', label: 'Home' },
    { href: '/user-dir', label: 'Directory' },
    { href: '/search', label: 'Search' },
  ]

  const streamingNavItems = [
    { href: '/stream-monitor', label: 'Stream Monitor' },
  ]

  const userNavItems = [
    { href: '/profile', label: 'Profile' },
  ]

  // Include all navigation items
  const navItems = [...baseNavItems, ...streamingNavItems, ...userNavItems]

  return (
    <NavigationMenu className="hidden md:flex">
      <NavigationMenuList>
        {navItems.map((item) => (
          <NavigationMenuItem key={item.href}>
            <Link href={item.href} legacyBehavior passHref>
              <NavigationMenuLink
                className={`${navigationMenuTriggerStyle()} ${
                  pathname === item.href
                    ? 'bg-gray-100 dark:bg-gray-800 font-semibold' // Enhanced active style
                    : ''
                } hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150`}
              >
                {item.label}
              </NavigationMenuLink>
            </Link>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  )
} 