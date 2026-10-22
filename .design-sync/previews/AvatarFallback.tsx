import { Avatar, AvatarFallback } from 'community-archive'

export const InContext = () => (
  <div className="flex w-72 min-w-0 items-center gap-3">
    <Avatar className="h-11 w-11 border border-border">
      <AvatarFallback>M</AvatarFallback>
    </Avatar>
    <div className="min-w-0">
      <div className="truncate font-semibold text-foreground">
        Marginalia Fan
      </div>
      <div className="truncate text-sm text-muted-foreground">
        @marginalia_fan
      </div>
    </div>
  </div>
)
