import { Checkbox, Label } from 'community-archive'

export const Default = () => (
  <div className="flex items-center space-x-2">
    <Checkbox id="terms" />
    <Label htmlFor="terms">I agree to make my tweets public</Label>
  </div>
)

export const States = () => (
  <div className="grid gap-3">
    <div className="flex items-center space-x-2">
      <Checkbox id="s-unchecked" />
      <Label htmlFor="s-unchecked">Include likes</Label>
    </div>
    <div className="flex items-center space-x-2">
      <Checkbox id="s-checked" defaultChecked />
      <Label htmlFor="s-checked">Include tweets</Label>
    </div>
    <div className="flex items-center space-x-2">
      <Checkbox id="s-disabled" disabled />
      <Label htmlFor="s-disabled">Include DMs (never uploaded)</Label>
    </div>
    <div className="flex items-center space-x-2">
      <Checkbox id="s-disabled-checked" disabled defaultChecked />
      <Label htmlFor="s-disabled-checked">Include profile (required)</Label>
    </div>
  </div>
)

export const UploadOptions = () => (
  <div className="w-80 space-y-4 rounded-lg border p-4">
    <div className="space-y-1">
      <h4 className="text-sm font-semibold">What to upload</h4>
      <p className="text-sm text-muted-foreground">
        Pick the parts of your archive that become public.
      </p>
    </div>
    <div className="flex items-start space-x-3">
      <Checkbox id="u-tweets" defaultChecked className="mt-0.5" />
      <div className="space-y-1">
        <Label htmlFor="u-tweets">Tweets and replies</Label>
        <p className="text-xs text-muted-foreground">412,083 items</p>
      </div>
    </div>
    <div className="flex items-start space-x-3">
      <Checkbox id="u-likes" defaultChecked className="mt-0.5" />
      <div className="space-y-1">
        <Label htmlFor="u-likes">Likes</Label>
        <p className="text-xs text-muted-foreground">38,214 items</p>
      </div>
    </div>
    <div className="flex items-start space-x-3">
      <Checkbox id="u-follows" className="mt-0.5" />
      <div className="space-y-1">
        <Label htmlFor="u-follows">Followers and following</Label>
        <p className="text-xs text-muted-foreground">2,140 accounts</p>
      </div>
    </div>
  </div>
)
