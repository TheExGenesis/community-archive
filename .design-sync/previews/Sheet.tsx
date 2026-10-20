import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Input,
  Label,
  Checkbox,
  Switch,
  Search,
  Archive,
  Users,
  Database,
  Code2,
  Newspaper,
} from 'community-archive'

export const FiltersRight = () => (
  <Sheet open>
    <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} side="right" className="flex flex-col">
      <SheetHeader>
        <SheetTitle>Filter tweets</SheetTitle>
        <SheetDescription>
          Narrow search results across every public archive.
        </SheetDescription>
      </SheetHeader>
      <div className="grid gap-5 py-2">
        <div className="grid gap-2">
          <Label htmlFor="from-user">From account</Label>
          <Input id="from-user" placeholder="@username" />
        </div>
        <div className="grid gap-3">
          <Label>Include</Label>
          <div className="flex items-center gap-2">
            <Checkbox id="inc-replies" defaultChecked />
            <Label htmlFor="inc-replies" className="font-normal">Replies</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="inc-rts" />
            <Label htmlFor="inc-rts" className="font-normal">Retweets</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="inc-quotes" defaultChecked />
            <Label htmlFor="inc-quotes" className="font-normal">Quote tweets</Label>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="liked-only">Only tweets with 10+ likes</Label>
          <Switch id="liked-only" />
        </div>
      </div>
      <SheetFooter className="mt-auto">
        <Button variant="outline">Reset</Button>
        <Button>Show 2,418 tweets</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
)

const navItems = [
  { label: 'Search', icon: Search, active: true },
  { label: 'Upload archive', icon: Archive },
  { label: 'Community stats', icon: Users },
  { label: 'Datasets', icon: Database },
  { label: 'API docs', icon: Code2 },
  { label: 'Blog', icon: Newspaper },
]

export const MobileNavLeft = () => (
  <Sheet open>
    <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} side="left" className="w-72">
      <SheetHeader>
        <SheetTitle>Community Archive</SheetTitle>
      </SheetHeader>
      <ul className="mt-6 space-y-1">
        {navItems.map(({ label, icon: Icon, active }) => (
          <li key={label}>
            <a
              href="#"
              className={
                active
                  ? 'flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-sm font-semibold'
                  : 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted'
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </SheetContent>
  </Sheet>
)
