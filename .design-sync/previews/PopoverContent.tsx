import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Avatar,
  AvatarFallback,
  Badge,
} from 'community-archive'

export const InContext = () => (
  <div className="flex justify-center p-4">
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left text-xs font-medium">
          <Avatar className="h-6 w-6 shrink-0">
            <AvatarFallback>QH</AvatarFallback>
          </Avatar>
          @quietharbor
        </button>
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()} className="w-72 p-3">
        <p className="text-sm font-semibold">@quietharbor</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Writes long threads about note-taking and slow software. Archive
          uploaded June 2024.
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge variant="secondary">9.8k tweets</Badge>
          <Badge variant="secondary">1.2k followers</Badge>
        </div>
      </PopoverContent>
    </Popover>
  </div>
)
