import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from 'community-archive'

export const Confirm = () => (
  <Dialog open>
    <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Revoke this key?</DialogTitle>
        <DialogDescription>
          Research notebook (cak_7f2a_…) will stop working within two minutes.
          Anything still using it will get 401 errors. This can&apos;t be
          undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline">Cancel</Button>
        <Button variant="destructive">Revoke key</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
