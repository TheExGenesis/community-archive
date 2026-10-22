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

export const InContext = () => <TopAccountsTable />
