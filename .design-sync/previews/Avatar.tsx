import { Avatar, AvatarImage, AvatarFallback } from 'community-archive'

const AVATAR_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#c7d2fe"/><circle cx="40" cy="31" r="15" fill="#4f46e5"/><path d="M12 80c3-17 15-26 28-26s25 9 28 26z" fill="#4f46e5"/></svg>',
  )

export const Initials = () => (
  <div className="flex items-center gap-3">
    <Avatar>
      <AvatarFallback>M</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>QL</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>T</AvatarFallback>
    </Avatar>
  </div>
)

export const Sizes = () => (
  <div className="flex items-end gap-3">
    <Avatar className="h-8 w-8">
      <AvatarFallback className="text-xs">S</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>S</AvatarFallback>
    </Avatar>
    <Avatar className="h-14 w-14">
      <AvatarFallback className="text-lg">S</AvatarFallback>
    </Avatar>
    <Avatar className="h-20 w-20 border border-border">
      <AvatarImage src={AVATAR_SVG} alt="Profile picture" />
      <AvatarFallback>S</AvatarFallback>
    </Avatar>
  </div>
)

export const WithImage = () => (
  <div className="flex items-center gap-3">
    <Avatar className="border border-border">
      <AvatarImage src={AVATAR_SVG} alt="@tidepool_notes's avatar" />
      <AvatarFallback>T</AvatarFallback>
    </Avatar>
    <Avatar className="border border-border">
      <AvatarImage src="" alt="Missing avatar" />
      <AvatarFallback>R</AvatarFallback>
    </Avatar>
  </div>
)

export const Stacked = () => (
  <div className="flex items-center gap-3">
    <div className="flex">
      {['M', 'Q', 'T', 'R'].map((letter, i) => (
        <Avatar
          key={letter}
          className="h-8 w-8 border-2 border-background"
          style={i === 0 ? undefined : { marginLeft: -8 }}
        >
          <AvatarFallback className="text-xs">{letter}</AvatarFallback>
        </Avatar>
      ))}
    </div>
    <span className="text-sm text-muted-foreground">
      +38 mutuals in the archive
    </span>
  </div>
)

export const UserRow = () => (
  <div className="flex w-72 min-w-0 items-center gap-3">
    <Avatar className="h-11 w-11 border border-border">
      <AvatarImage src={AVATAR_SVG} alt="Quiet Lantern's avatar" />
      <AvatarFallback>Q</AvatarFallback>
    </Avatar>
    <div className="min-w-0">
      <div className="truncate font-semibold text-foreground">
        Quiet Lantern
      </div>
      <div className="truncate text-sm text-muted-foreground">
        @quiet_lantern
      </div>
    </div>
  </div>
)
