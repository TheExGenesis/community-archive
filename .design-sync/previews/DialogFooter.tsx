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
        <DialogTitle>Delete your archive?</DialogTitle>
        <DialogDescription>
          This removes 18,204 tweets, 41,977 likes and your follower graph from
          the Community Archive. Search results and the public API will stop
          returning them within an hour.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline">Keep my archive</Button>
        <Button variant="destructive">Delete archive</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
