import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Download,
} from 'community-archive'

export const InContext = () => (
  <Sheet open>
    <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} side="right" className="flex flex-col">
      <SheetHeader>
        <SheetTitle>Export search results</SheetTitle>
        <SheetDescription>
          1,204 tweets matching &quot;tools for thought&quot; from 86 archives.
        </SheetDescription>
      </SheetHeader>
      <p className="text-sm text-muted-foreground">
        Exports include tweet text, timestamps, like counts and the author
        handle. Media files are linked, not bundled.
      </p>
      <SheetFooter className="mt-auto">
        <Button variant="outline">Cancel</Button>
        <Button>
          <Download className="mr-2 h-4 w-4" />
          Download CSV
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
)
