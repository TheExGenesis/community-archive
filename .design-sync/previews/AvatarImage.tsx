import { Avatar, AvatarImage, AvatarFallback } from 'community-archive'

const AVATAR_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#fde68a"/><circle cx="40" cy="31" r="15" fill="#b45309"/><path d="M12 80c3-17 15-26 28-26s25 9 28 26z" fill="#b45309"/></svg>',
  )

export const InContext = () => (
  <div className="flex w-72 min-w-0 items-center gap-3">
    <Avatar className="h-11 w-11 border border-border">
      <AvatarImage src={AVATAR_SVG} alt="Tidepool Notes's avatar" />
      <AvatarFallback>T</AvatarFallback>
    </Avatar>
    <div className="min-w-0">
      <div className="truncate font-semibold text-foreground">
        Tidepool Notes
      </div>
      <div className="truncate text-sm text-muted-foreground">
        @tidepool_notes
      </div>
    </div>
  </div>
)
