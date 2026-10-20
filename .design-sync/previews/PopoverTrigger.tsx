import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Button,
  Info,
} from 'community-archive'

export const InContext = () => (
  <div className="flex justify-center p-4">
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <Info className="mr-2 h-4 w-4" />
          Why is this tweet missing?
        </Button>
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()} className="w-80 text-sm">
        <p className="font-semibold">Only opted-in archives are shown</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          The author hasn&apos;t uploaded an archive, or keeps theirs private.
          Replies to them can still appear in other people&apos;s threads.
        </p>
      </PopoverContent>
    </Popover>
  </div>
)
