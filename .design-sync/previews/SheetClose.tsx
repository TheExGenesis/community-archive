import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
  Button,
  CheckCircle2,
} from 'community-archive'

export const InContext = () => (
  <Sheet open>
    <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} side="right" className="flex flex-col">
      <SheetHeader>
        <SheetTitle>Archive processing</SheetTitle>
        <SheetDescription>You can close this panel. We&apos;ll keep going in the background.</SheetDescription>
      </SheetHeader>
      <ul className="space-y-3 text-sm">
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" /> Tweets imported (9,812)
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" /> Likes imported (2,340)
        </li>
        <li className="flex items-center gap-2 text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" /> Building search index…
        </li>
      </ul>
      <SheetFooter className="mt-auto">
        <SheetClose asChild>
          <Button variant="outline">Close</Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
)
