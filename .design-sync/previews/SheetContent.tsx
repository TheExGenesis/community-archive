import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Input,
  Label,
} from 'community-archive'

export const InContext = () => (
  <Sheet open>
    <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} side="right" className="flex flex-col">
      <SheetHeader>
        <SheetTitle>Edit profile</SheetTitle>
        <SheetDescription>
          How your archive appears on its public page.
        </SheetDescription>
      </SheetHeader>
      <div className="grid gap-4 py-2">
        <div className="grid gap-2">
          <Label htmlFor="display-name">Display name</Label>
          <Input id="display-name" defaultValue="Quiet Harbor" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="handle">Handle</Label>
          <Input id="handle" defaultValue="@quietharbor" disabled />
        </div>
      </div>
      <SheetFooter className="mt-auto">
        <Button>Save profile</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
)
