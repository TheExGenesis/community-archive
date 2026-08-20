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

import {
  isNavItemActive,
  navAnalyticsDestination,
  NavItem,
} from '@/lib/navigation'
import { cn } from '@/utils/tailwind'
import { capturePostHogEvent } from '@/lib/posthog'

export default function MobileNavigation({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="xl:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open navigation menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 rounded-lg p-2 xl:hidden"
      >
        <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Navigation
        </DropdownMenuLabel>
        {items.map((item) => {
          const isActive = isNavItemActive(pathname, item.href)

          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                onClick={() =>
                  capturePostHogEvent('navigation_item_clicked', {
                    destination: navAnalyticsDestination(item.href),
                    surface: 'mobile',
                    already_active: isActive,
                  })
                }
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'cursor-pointer py-2.5',
                  item.tone === 'muted'
                    ? 'bg-muted/70 text-muted-foreground focus:bg-muted focus:text-foreground'
                    : '',
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
  )
}
