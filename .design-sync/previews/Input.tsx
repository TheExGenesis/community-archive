import { Input, Label, Button, Search } from 'community-archive'

export const Default = () => (
  <div className="w-80">
    <Input placeholder="Search tweets…" />
  </div>
)

export const WithLabel = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="key-name">API key name</Label>
    <Input id="key-name" defaultValue="Research notebook" />
    <p className="text-xs text-muted-foreground">
      Only you see this name. It helps you tell keys apart.
    </p>
  </div>
)

export const States = () => (
  <div className="grid w-80 gap-4">
    <div className="grid gap-2">
      <Label htmlFor="i-empty">Username</Label>
      <Input id="i-empty" placeholder="@handle" />
    </div>
    <div className="grid gap-2">
      <Label htmlFor="i-disabled">Account ID</Label>
      <Input id="i-disabled" disabled defaultValue="1378862677871751174" />
    </div>
    <div className="grid gap-2">
      <Label htmlFor="i-file">Archive file</Label>
      <Input id="i-file" type="file" />
    </div>
  </div>
)

export const SearchBar = () => (
  <div className="flex items-center gap-2" style={{ width: 384 }}>
    <div className="relative flex-1">
      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input className="pl-9" placeholder="Search 6.4M archived tweets" />
    </div>
    <Button>Search</Button>
  </div>
)
