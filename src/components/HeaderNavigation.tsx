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
import { cn } from '@/utils/tailwind'

export default function HeaderNavigation() {
  const pathname = usePathname()

  const baseNavItems = [
    { href: '/', label: 'Home' },
    { href: '/#products', label: 'Products' },
    { href: '/user-dir', label: 'User Directory' },
    { href: '/search', label: 'Search' },
  ]

  const streamingNavItems = [
    { href: '/stream-monitor', label: 'Stream Monitor' },
  ]

  const navItems = [...baseNavItems, ...streamingNavItems]

  return (
    <NavigationMenu className="hidden lg:flex">
      <NavigationMenuList>
        {navItems.map((item) => (
          <NavigationMenuItem key={item.href}>
            <Link href={item.href} legacyBehavior passHref>
              <NavigationMenuLink
                className={cn(
                  navigationMenuTriggerStyle(),
                  'transition-colors duration-150 hover:bg-accent',
                  pathname === item.href ? 'bg-muted font-semibold' : '',
                )}
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
