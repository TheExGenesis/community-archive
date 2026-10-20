import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  Users,
  Radio,
  TrendingUp,
  Network,
  Star,
  GitBranch,
} from 'community-archive'

// Same look as NavigationMenuTrigger, for plain top-level links.
const linkStyle =
  'inline-flex h-10 w-max items-center justify-center rounded-[8px] bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground data-[active]:bg-accent/50'

const explore = [
  { icon: Users, label: 'Explore by user', description: 'Browse people and their archived tweets.' },
  { icon: Radio, label: 'Live Stream', description: "Watch tweets arrive from the community's browser extensions." },
  { icon: TrendingUp, label: 'Trends', description: 'Discover what the community is talking about.' },
  { icon: Network, label: 'Social Graph', description: 'Explore connections between people and ideas.' },
]

const ideas = [
  { icon: Star, label: 'Bangers', description: 'The best tweets of all time.' },
  { icon: GitBranch, label: 'Strands', description: 'Follow ideas and narratives as they evolve over time.' },
]

type Entry = { icon: React.ComponentType<{ className?: string }>; label: string; description: string }

const Panel = ({ items }: { items: Entry[] }) => (
  <ul className="w-[28rem] space-y-0.5 p-3">
    {items.map(({ icon: Icon, label, description }) => (
      <li key={label}>
        <NavigationMenuLink
          href="#"
          className="flex items-start gap-3.5 rounded-lg p-2.5 transition-colors hover:bg-brand/5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 pt-0.5">
            <span className="block text-[15px] font-semibold leading-tight text-foreground">
              {label}
            </span>
            <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
              {description}
            </span>
          </span>
        </NavigationMenuLink>
      </li>
    ))}
  </ul>
)

const SiteNav = ({ defaultValue }: { defaultValue?: string }) => (
  <NavigationMenu defaultValue={defaultValue} aria-label="Main">
    <NavigationMenuList>
      <NavigationMenuItem>
        <NavigationMenuLink href="#" active className={linkStyle}>
          Home
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem value="ideas">
        <NavigationMenuTrigger>Ideas</NavigationMenuTrigger>
        <NavigationMenuContent>
          <Panel items={ideas} />
        </NavigationMenuContent>
      </NavigationMenuItem>
      <NavigationMenuItem value="explore">
        <NavigationMenuTrigger>Explore archive</NavigationMenuTrigger>
        <NavigationMenuContent>
          <Panel items={explore} />
        </NavigationMenuContent>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink href="#" className={linkStyle}>
          Docs
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
  </NavigationMenu>
)

export const Default = () => <SiteNav />

export const Open = () => (
  <div style={{ minHeight: 360 }}>
    <SiteNav defaultValue="explore" />
  </div>
)

export const IdeasOpen = () => (
  <div style={{ minHeight: 240 }}>
    <SiteNav defaultValue="ideas" />
  </div>
)
