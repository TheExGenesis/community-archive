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
import { isNavItemActive, NavItem } from '@/lib/navigation'

export default function HeaderNavigation({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <NavigationMenu className="hidden xl:flex">
      <NavigationMenuList>
        {items.map((item) => {
          const isActive = isNavItemActive(pathname, item.href)
          return (
            <NavigationMenuItem key={item.href}>
              <Link href={item.href} legacyBehavior passHref>
                <NavigationMenuLink
                  className={cn(
                    navigationMenuTriggerStyle(),
                    'px-2.5 text-xs transition-colors duration-150 hover:bg-accent 2xl:px-4 2xl:text-sm',
                    item.tone === 'muted'
                      ? 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                      : '',
                    isActive ? 'bg-muted font-semibold' : '',
                  )}
                >
                  {item.label}
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
          )
        })}
      </NavigationMenuList>
    </NavigationMenu>
  )
}
