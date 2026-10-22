import { Label, Input, Checkbox, Switch } from 'community-archive'

export const Default = () => <Label>Display name</Label>

export const WithControls = () => (
  <div className="grid w-80 gap-4">
    <div className="grid gap-2">
      <Label htmlFor="l-email">Contact email</Label>
      <Input id="l-email" placeholder="you@example.com" />
    </div>
    <div className="flex items-center space-x-2">
      <Checkbox id="l-public" defaultChecked />
      <Label htmlFor="l-public">Make my archive public</Label>
    </div>
    <div className="flex items-center justify-between">
      <Label htmlFor="l-stream">Stream new tweets</Label>
      <Switch id="l-stream" />
    </div>
  </div>
)

export const Disabled = () => (
  <div className="flex items-center space-x-2">
    <Checkbox id="l-disabled" disabled />
    <Label htmlFor="l-disabled">Include DMs (never uploaded)</Label>
  </div>
)
