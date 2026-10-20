import { Button, Download, Plus, Trash2, Loader2, Search } from 'community-archive'

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Upload archive</Button>
    <Button variant="secondary">Browse tweets</Button>
    <Button variant="outline">View profile</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="destructive">Delete archive</Button>
    <Button variant="link">Read the data policy</Button>
  </div>
)

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="sm">Small</Button>
    <Button>Default</Button>
    <Button size="lg">Large</Button>
    <Button size="icon" variant="outline" aria-label="Search">
      <Search className="h-4 w-4" />
    </Button>
  </div>
)

export const WithIcon = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>
      <Download className="mr-2 h-4 w-4" />
      Download JSON
    </Button>
    <Button variant="outline">
      <Plus className="mr-2 h-4 w-4" />
      New API key
    </Button>
    <Button variant="destructive">
      <Trash2 className="mr-2 h-4 w-4" />
      Revoke key
    </Button>
  </div>
)

export const States = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button disabled>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Processing archive…
    </Button>
    <Button variant="outline" disabled>
      Disabled
    </Button>
  </div>
)
