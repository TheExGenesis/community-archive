import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
} from 'community-archive'

export const InContext = () => (
  <Dialog open>
    <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <DialogTitle>Make your archive public</DialogTitle>
          <Badge variant="secondary">Opt-in</Badge>
        </div>
        <DialogDescription>
          Your tweets become searchable on the site and available through the
          public API. You can switch back to private at any time.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline">Not now</Button>
        <Button>Opt in</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
