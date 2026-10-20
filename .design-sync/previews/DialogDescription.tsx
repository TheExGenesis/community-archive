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
        <DialogTitle>What gets uploaded?</DialogTitle>
        <DialogDescription>
          Only tweets, likes, followers and following leave your browser. Direct
          messages, email addresses and phone numbers are stripped out before
          the upload starts, and nothing is public until you opt in.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline">Read the privacy notes</Button>
        <Button>Got it</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
