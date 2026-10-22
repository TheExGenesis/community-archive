import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
} from 'community-archive'

export const InContext = () => (
  <Dialog open>
    <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit API key</DialogTitle>
        <DialogDescription>
          Rename this key so you can tell your scripts apart. The secret itself
          stays the same.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="grid gap-2">
          <Label htmlFor="key-name">Name</Label>
          <Input id="key-name" defaultValue="Research notebook" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="key-prefix">Key prefix</Label>
          <Input id="key-prefix" className="font-mono" defaultValue="cak_7f2a_…" disabled />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline">Cancel</Button>
        <Button>Save changes</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
