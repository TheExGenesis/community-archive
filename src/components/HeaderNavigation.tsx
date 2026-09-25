'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { cn } from '@/utils/tailwind'
import {
  isNavItemActive,
  navAnalyticsDestination,
  NavItem,
} from '@/lib/navigation'
import { capturePostHogEvent } from '@/lib/posthog'

const ITEM_CLASS =
  'px-1.5 text-xs transition-colors duration-150 hover:bg-accent 2xl:px-2.5 2xl:text-sm'

function trackNavigation(href: string, isActive: boolean) {
  capturePostHogEvent('navigation_item_clicked', {
    destination: navAnalyticsDestination(href),
    surface: 'desktop',
    already_active: isActive,
  })
}

function MoreMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const hasActive = items.some((item) => isNavItemActive(pathname, item.href))
  return (
    <NavigationMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            navigationMenuTriggerStyle(),
            ITEM_CLASS,
            'gap-1',
            hasActive ? 'bg-muted font-semibold' : '',
          )}
        >
          More
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="w-48 p-1.5"
        >
          {items.map((item) => {
            const isActive = isNavItemActive(pathname, item.href)
            return (
              <DropdownMenuItem key={item.href} asChild>
                <Link
                  href={item.href}
                  onClick={() => trackNavigation(item.href, isActive)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'cursor-pointer py-2',
                    isActive ? 'bg-muted font-medium' : '',
                  )}
                >
                  {item.label}
                </Link>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </NavigationMenuItem>
  )
}

export default function HeaderNavigation({
  items,
  more = [],
}: {
  items: NavItem[]
  more?: NavItem[]
}) {
  const pathname = usePathname()

  return (
    <NavigationMenu className="hidden lg:flex">
      <NavigationMenuList>
        {items.map((item) => {
          const isActive = isNavItemActive(pathname, item.href)
          return (
            <NavigationMenuItem key={item.href}>
              <Link href={item.href} legacyBehavior passHref>
                <NavigationMenuLink
                  onClick={() => trackNavigation(item.href, isActive)}
                  className={cn(
                    navigationMenuTriggerStyle(),
                    ITEM_CLASS,
                    isActive ? 'bg-muted font-semibold' : '',
                  )}
                >
                  {item.label}
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
          )
        })}
        {more.length > 0 && <MoreMenu items={more} pathname={pathname} />}
      </NavigationMenuList>
    </NavigationMenu>
  )
}
