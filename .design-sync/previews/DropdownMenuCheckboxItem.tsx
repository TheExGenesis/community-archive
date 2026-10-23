import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Button,
  SlidersHorizontal,
} from 'community-archive'

export const InContext = () => (
  <DropdownMenu defaultOpen modal={false}>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" className="gap-2">
        <SlidersHorizontal className="h-4 w-4" />
        Filter tweets
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuLabel>Include</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem checked>Original tweets</DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem checked>Replies</DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem checked={false}>Retweets</DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem checked>Quote tweets</DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem checked={false} disabled>
        Deleted tweets
      </DropdownMenuCheckboxItem>
    </DropdownMenuContent>
  </DropdownMenu>
)
