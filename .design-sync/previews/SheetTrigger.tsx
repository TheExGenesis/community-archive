import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Button,
  SlidersHorizontal,
  Label,
  Checkbox,
} from 'community-archive'

// modal={false} skips the dimming overlay so the trigger stays visible
// next to the open sheet.
export const InContext = () => (
  <div className="p-6">
    <Sheet open modal={false}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} side="right">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Choose which tweets appear in results.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 grid gap-3">
          <div className="flex items-center gap-2">
            <Checkbox id="t-replies" defaultChecked />
            <Label htmlFor="t-replies" className="font-normal">Replies</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="t-rts" />
            <Label htmlFor="t-rts" className="font-normal">Retweets</Label>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  </div>
)
