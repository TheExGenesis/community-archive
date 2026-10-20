import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Label,
  Switch,
} from 'community-archive'

export const InContext = () => (
  <Sheet open>
    <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} side="right" className="flex flex-col">
      <SheetHeader>
        <SheetTitle>Privacy settings</SheetTitle>
        <SheetDescription>
          Public archives are searchable by anyone and included in dataset
          exports. Changes take effect within an hour.
        </SheetDescription>
      </SheetHeader>
      <div className="grid gap-4 py-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="pub-archive">Public archive</Label>
          <Switch id="pub-archive" defaultChecked />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="pub-likes">Include likes</Label>
          <Switch id="pub-likes" />
        </div>
      </div>
      <SheetFooter className="mt-auto">
        <Button>Save</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
)
