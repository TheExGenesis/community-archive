'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useState } from 'react'
import * as NavigationMenu from '@radix-ui/react-navigation-menu'
import { ChevronDown } from 'lucide-react'
import NavIcon from '@/components/NavIcon'
import { cn } from '@/utils/tailwind'
import {
  isNavGroup,
  isNavGroupActive,
  isNavItemActive,
  navAnalyticsDestination,
  NavEntry,
  NavGroup,
  NavItem,
} from '@/lib/navigation'
import { capturePostHogEvent } from '@/lib/posthog'

const topLevelStyle =
  'inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-brand/5 hover:text-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 xl:px-3 xl:text-sm'
const activeStyle = 'bg-brand/10 font-semibold text-brand-deep'

function trackClick(href: string, alreadyActive: boolean) {
  capturePostHogEvent('navigation_item_clicked', {
    destination: navAnalyticsDestination(href),
    surface: 'desktop',
    already_active: alreadyActive,
  })
}

function DirectLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = isNavItemActive(pathname, item.href)
  return (
    <NavigationMenu.Item>
      <NavigationMenu.Link asChild active={isActive}>
        <Link
          href={item.href}
          onClick={() => trackClick(item.href, isActive)}
          className={cn(topLevelStyle, isActive && activeStyle)}
        >
          {item.label}
        </Link>
      </NavigationMenu.Link>
    </NavigationMenu.Item>
  )
}

// A click this soon after a hover opened the menu is the same intent, not a
// request to close it (Radix would otherwise toggle it shut).
const HOVER_CLICK_GRACE_MS = 600

function GroupMenu({
  group,
  pathname,
  isOpen,
  openedAt,
}: {
  group: NavGroup
  pathname: string
  isOpen: boolean
  openedAt: React.MutableRefObject<number>
}) {
  const isActive = isNavGroupActive(pathname, group)
  return (
    <NavigationMenu.Item value={group.label} className="relative">
      <NavigationMenu.Trigger
        onClick={(event) => {
          if (isOpen && Date.now() - openedAt.current < HOVER_CLICK_GRACE_MS) {
            event.preventDefault()
          }
        }}
        className={cn(
          topLevelStyle,
          'group data-[state=open]:bg-brand/5 data-[state=open]:text-brand-deep',
          isActive && activeStyle,
        )}
      >
        {group.label}
        <ChevronDown
          className="h-3.5 w-3.5 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </NavigationMenu.Trigger>
      {/* The top padding is part of the hover target, so the pointer can travel
          from trigger to panel without the menu closing. */}
      <NavigationMenu.Content className="absolute left-0 top-full origin-top-left pt-2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
        <div className="w-[28rem] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg shadow-black/5 dark:shadow-black/40">
          <p className="px-2.5 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const itemActive = isNavItemActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <NavigationMenu.Link asChild active={itemActive}>
                    <Link
                      href={item.href}
                      onClick={() => trackClick(item.href, itemActive)}
                      className="group/item flex items-start gap-3.5 rounded-lg p-2.5 outline-none transition-colors hover:bg-brand/5 focus-visible:bg-brand/5 focus-visible:ring-2 focus-visible:ring-brand/60 data-[active]:bg-brand/10"
                    >
                      <NavIcon name={item.icon} />
                      <span className="min-w-0 pt-0.5">
                        <span className="block text-[15px] font-semibold leading-tight text-foreground group-data-[active]/item:text-brand-deep">
                          {item.label}
                        </span>
                        <span className="mt-1 block text-[13px] font-normal leading-snug text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  </NavigationMenu.Link>
                </li>
              )
            })}
          </ul>
        </div>
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  )
}

export default function HeaderNavigation({
  entries,
  label,
}: {
  entries: NavEntry[]
  label: string
}) {
  const pathname = usePathname()
  const [openMenu, setOpenMenu] = useState('')
  const openedAt = useRef(0)

  return (
    <NavigationMenu.Root
      aria-label={label}
      value={openMenu}
      onValueChange={(next) => {
        if (next && next !== openMenu) openedAt.current = Date.now()
        setOpenMenu(next)
      }}
      delayDuration={120}
      className="relative z-10 hidden lg:flex"
    >
      <NavigationMenu.List className="flex list-none items-center gap-0.5">
        {entries.map((entry) =>
          isNavGroup(entry) ? (
            <GroupMenu
              key={entry.label}
              group={entry}
              pathname={pathname}
              isOpen={openMenu === entry.label}
              openedAt={openedAt}
            />
          ) : (
            <DirectLink key={entry.href} item={entry} pathname={pathname} />
          ),
        )}
      </NavigationMenu.List>
    </NavigationMenu.Root>
  )
}
