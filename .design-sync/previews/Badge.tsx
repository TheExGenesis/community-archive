import { Badge, Check, X } from 'community-archive'

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Opted in</Badge>
    <Badge variant="secondary">Public</Badge>
    <Badge variant="outline">Allowed</Badge>
    <Badge variant="destructive">Explicit opt-out</Badge>
  </div>
)

export const WithIcon = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="secondary">
      <Check className="mr-1 h-3 w-3" />
      Archive uploaded
    </Badge>
    <Badge variant="outline">
      <X className="mr-1 h-3 w-3" />
      No archive yet
    </Badge>
    <Badge variant="secondary">@quiet_lantern</Badge>
  </div>
)

export const KeyStatus = () => (
  <div className="w-80 space-y-3 rounded-lg border bg-card p-4 text-sm">
    <div className="flex items-center justify-between">
      <span className="font-medium">Research notebook</span>
      <Badge variant="secondary">Active</Badge>
    </div>
    <div className="flex items-center justify-between">
      <span className="font-medium">Old scraper</span>
      <Badge variant="outline">Revoked</Badge>
    </div>
    <div className="flex items-center justify-between">
      <span className="font-medium">CI smoke test</span>
      <Badge variant="outline">Expired</Badge>
    </div>
  </div>
)
