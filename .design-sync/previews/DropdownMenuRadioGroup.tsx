import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Button,
  ArrowUpDown,
} from 'community-archive'

export const InContext = () => (
  <DropdownMenu defaultOpen modal={false}>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" className="gap-2">
        <ArrowUpDown className="h-4 w-4" />
        Sort: Most liked
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuLabel>Sort tweets by</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup value="likes">
        <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="likes">Most liked</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="retweets">Most retweeted</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
)
