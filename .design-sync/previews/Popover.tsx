import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Button,
  Input,
  Label,
  Checkbox,
  Link2,
  Copy,
  SlidersHorizontal,
} from 'community-archive'

export const Share = () => (
  <div className="flex justify-center p-4">
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Link2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()} className="w-80">
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold leading-none">Share this thread</h4>
            <p className="text-xs text-muted-foreground">
              Anyone with the link can read it, even without an account.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              className="h-9 text-xs"
              defaultValue="community-archive.org/tweets/1729…"
            />
            <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" aria-label="Copy link">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </div>
)

export const Filters = () => (
  <div className="flex justify-center p-4">
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters
        </Button>
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()} className="w-64" align="start">
        <div className="grid gap-3">
          <h4 className="text-sm font-semibold leading-none">Show in results</h4>
          <div className="flex items-center gap-2">
            <Checkbox id="pf-replies" defaultChecked />
            <Label htmlFor="pf-replies" className="font-normal">Replies</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="pf-rts" />
            <Label htmlFor="pf-rts" className="font-normal">Retweets</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="pf-media" defaultChecked />
            <Label htmlFor="pf-media" className="font-normal">Tweets with media</Label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </div>
)
