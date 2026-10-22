import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Plus,
} from 'community-archive'

// modal={false} skips the dimming overlay so the trigger stays visible
// next to the open dialog.
export const InContext = () => (
  <div className="p-6">
    <Dialog open modal={false}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New API key
        </Button>
      </DialogTrigger>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create an API key</DialogTitle>
          <DialogDescription>
            Keys let scripts query the archive with your account&apos;s rate
            limits. You can revoke a key at any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Create key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
)
