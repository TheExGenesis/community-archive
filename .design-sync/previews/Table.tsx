import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  SearchX,
} from 'community-archive'

const ACCOUNTS = [
  { name: "Quiet Lantern", handle: "quiet_lantern", tweets: "48,210", likes: "112,904", status: "Opted in" },
  { name: "Marginalia Fan", handle: "marginalia_fan", tweets: "41,377", likes: "86,015", status: "Opted in" },
  { name: "Tidepool Notes", handle: "tidepool_notes", tweets: "29,862", likes: "54,330", status: "Archive only" },
  { name: "Rhizome Garden", handle: "rhizome_garden", tweets: "17,045", likes: "40,118", status: "Opted in" },
]

const TopAccountsTable = () => (
  <div style={{ width: 640 }}>
    <Table>
      <TableCaption>Top uploaded archives by tweet count, updated hourly.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Tweets</TableHead>
          <TableHead className="text-right">Likes</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ACCOUNTS.map((a) => (
          <TableRow key={a.handle}>
            <TableCell>
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-8 w-8 border border-border">
                  <AvatarFallback className="text-xs">{a.name[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground">{a.name}</div>
                  <div className="truncate text-xs text-muted-foreground">@{a.handle}</div>
                </div>
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{a.tweets}</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{a.likes}</TableCell>
            <TableCell className="text-right">
              <Badge variant={a.status === "Opted in" ? "secondary" : "outline"}>{a.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>4 accounts</TableCell>
          <TableCell className="text-right tabular-nums">136,494</TableCell>
          <TableCell className="text-right tabular-nums">293,367</TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  </div>
)

export const TopAccounts = () => <TopAccountsTable />

const KEYS = [
  { label: 'Research notebook', id: '7f2a', created: 'Sep 2, 2026', used: '2 hours ago', status: 'Active' },
  { label: 'Thread explorer', id: 'b91c', created: 'Aug 14, 2026', used: 'Oct 18, 2026', status: 'Active' },
  { label: 'Old scraper', id: '03de', created: 'Mar 9, 2026', used: 'Jun 1, 2026', status: 'Revoked' },
]

export const ApiKeys = () => (
  <div style={{ width: 680 }}>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Key</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Last used</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {KEYS.map((k) => (
          <TableRow key={k.id}>
            <TableCell className="whitespace-nowrap font-medium">{k.label}</TableCell>
            <TableCell className="whitespace-nowrap font-mono text-xs">cak_{k.id}_…</TableCell>
            <TableCell className="whitespace-nowrap">{k.created}</TableCell>
            <TableCell className="whitespace-nowrap">{k.used}</TableCell>
            <TableCell>
              <Badge variant={k.status === 'Active' ? 'secondary' : 'outline'}>{k.status}</Badge>
            </TableCell>
            <TableCell className="text-right">
              {k.status === 'Active' ? (
                <Button variant="ghost" size="sm">Revoke</Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
)

export const Empty = () => (
  <div style={{ width: 560 }}>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Followers</TableHead>
          <TableHead className="text-right">Joined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={3} className="h-24 text-center text-sm text-muted-foreground">
            <span className="inline-flex items-center">
              <SearchX className="mr-2 h-4 w-4" />
              No users match “lighthouse keeper”.
            </span>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
)
