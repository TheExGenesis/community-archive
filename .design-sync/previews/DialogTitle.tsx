import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from 'community-archive'

export const InContext = () => (
  <Dialog open>
    <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Upload complete</DialogTitle>
        <DialogDescription>
          @quietharbor&apos;s archive is in. 9,812 tweets and 2,340 likes are
          being indexed now and will show up in search in a few minutes.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button>View my archive</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
