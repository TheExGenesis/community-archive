import {
  GitBranch,
  LayoutGrid,
  Megaphone,
  Network,
  Radio,
  Star,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { NavIcon as NavIconName } from '@/lib/navigation'

const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  bangers: Star,
  strands: GitBranch,
  users: Users,
  stream: Radio,
  trends: TrendingUp,
  graph: Network,
  bulletin: Megaphone,
  apps: LayoutGrid,
}

/** The bordered icon tile shown beside each submenu item. */
export default function NavIcon({ name }: { name: NavIconName }) {
  const Icon = NAV_ICONS[name]
  return (
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground transition-colors group-hover/item:border-brand/40 group-hover/item:text-brand-deep group-focus-visible/item:border-brand/40 group-focus-visible/item:text-brand-deep group-data-[active]/item:border-brand/40 group-data-[active]/item:text-brand-deep">
      <Icon
        className="h-[18px] w-[18px]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </span>
  )
}
