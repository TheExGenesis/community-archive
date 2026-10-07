'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChevronDown, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import NavIcon from '@/components/NavIcon'
import {
  isNavGroup,
  isNavGroupActive,
  isNavItemActive,
  navAnalyticsDestination,
  NavEntry,
  NavGroup,
} from '@/lib/navigation'
import { cn } from '@/utils/tailwind'
import { capturePostHogEvent } from '@/lib/posthog'

function trackClick(href: string, alreadyActive: boolean) {
  capturePostHogEvent('navigation_item_clicked', {
    destination: navAnalyticsDestination(href),
    surface: 'mobile',
    already_active: alreadyActive,
  })
}

function MobileGroup({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup
  pathname: string
  onNavigate: () => void
}) {
  const isActive = isNavGroupActive(pathname, group)
  const [expanded, setExpanded] = useState(isActive)
  const panelId = `mobile-nav-${group.label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <li>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((open) => !open)}
        className={cn(
          'flex min-h-[3rem] w-full items-center justify-between rounded-lg px-3 text-left text-base font-semibold transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
          isActive && 'text-brand',
        )}
      >
        {group.label}
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <ul id={panelId} className="mb-2 space-y-0.5">
          {group.items.map((item) => {
            const itemActive = isNavItemActive(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-active={itemActive ? '' : undefined}
                  aria-current={itemActive ? 'page' : undefined}
                  onClick={() => {
                    trackClick(item.href, itemActive)
                    onNavigate()
                  }}
                  className="group/item flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 data-[active]:bg-brand/10"
                >
                  <NavIcon name={item.icon} />
                  <span className="min-w-0 pt-0.5">
                    <span className="block text-[15px] font-semibold leading-tight group-data-[active]/item:text-brand">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

export default function MobileNavigation({ entries }: { entries: NavEntry[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [pathname])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open navigation menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-[85vw] max-w-sm flex-col gap-0 overflow-y-auto p-0 lg:hidden"
      >
        <SheetTitle className="border-b border-border px-6 py-4 text-xs font-medium uppercase tracking-wide text-muted-foreground [font-family:inherit]">
          Navigation
        </SheetTitle>
        <ul className="space-y-0.5 p-3">
          {entries.map((entry) => {
            if (isNavGroup(entry)) {
              return (
                <MobileGroup
                  key={entry.label}
                  group={entry}
                  pathname={pathname}
                  onNavigate={() => setOpen(false)}
                />
              )
            }
            const isActive = isNavItemActive(pathname, entry.href)
            return (
              <li key={entry.href}>
                <Link
                  href={entry.href}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    trackClick(entry.href, isActive)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex min-h-[3rem] items-center rounded-lg px-3 text-base font-semibold transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
                    isActive && 'bg-brand/10 text-brand',
                  )}
                >
                  {entry.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
