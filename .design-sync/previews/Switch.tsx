import { Switch, Label, Card, CardHeader, CardTitle, CardDescription, CardContent } from 'community-archive'

export const Default = () => (
  <div className="flex items-center space-x-2">
    <Switch id="sw-default" defaultChecked />
    <Label htmlFor="sw-default">Stream new tweets</Label>
  </div>
)

export const States = () => (
  <div className="grid gap-3">
    <div className="flex items-center space-x-2">
      <Switch id="sw-off" />
      <Label htmlFor="sw-off">Off</Label>
    </div>
    <div className="flex items-center space-x-2">
      <Switch id="sw-on" defaultChecked />
      <Label htmlFor="sw-on">On</Label>
    </div>
    <div className="flex items-center space-x-2">
      <Switch id="sw-dis" disabled />
      <Label htmlFor="sw-dis">Disabled</Label>
    </div>
    <div className="flex items-center space-x-2">
      <Switch id="sw-dis-on" disabled defaultChecked />
      <Label htmlFor="sw-dis-on">Disabled, on</Label>
    </div>
  </div>
)

export const SettingsCard = () => (
  <Card style={{ width: 384 }}>
    <CardHeader className="space-y-1.5">
      <CardTitle className="text-lg">Tweet streaming</CardTitle>
      <CardDescription>Control whether new tweets join the archive.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="sc-optin">Opt in to streaming</Label>
          <div className="text-sm text-muted-foreground">
            New public tweets are saved as you post them.
          </div>
        </div>
        <Switch id="sc-optin" defaultChecked />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="sc-optout">Explicit opt-out</Label>
          <div className="text-sm text-muted-foreground">
            Exclude your tweets even when others upload them.
          </div>
        </div>
        <Switch id="sc-optout" className="data-[state=checked]:bg-destructive" />
      </div>
    </CardContent>
  </Card>
)
