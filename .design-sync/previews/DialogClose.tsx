import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
  Input,
  Copy,
} from 'community-archive'

export const InContext = () => (
  <Dialog open>
    <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Your new API key</DialogTitle>
        <DialogDescription>
          Copy it now. For your security we only show the full key once.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          className="font-mono"
          defaultValue="cak_9d41_x2Lr8QwPz3mT"
        />
        <Button variant="outline" size="icon" aria-label="Copy key">
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button>I&apos;ve saved it</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
