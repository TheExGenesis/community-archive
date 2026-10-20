import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Badge,
} from 'community-archive'

export const InContext = () => (
  <Sheet open>
    <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} side="right">
      <SheetHeader>
        <SheetTitle>@marginalia_fan</SheetTitle>
        <SheetDescription>
          Archive uploaded March 2024 · last refreshed 3 days ago
        </SheetDescription>
      </SheetHeader>
      <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="font-semibold">412k</div>
          <div className="text-muted-foreground">Tweets</div>
        </div>
        <div>
          <div className="font-semibold">38k</div>
          <div className="text-muted-foreground">Likes</div>
        </div>
        <div>
          <div className="font-semibold">2.1k</div>
          <div className="text-muted-foreground">Following</div>
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        <Badge variant="secondary">Public</Badge>
        <Badge variant="outline">Likes included</Badge>
      </div>
    </SheetContent>
  </Sheet>
)
