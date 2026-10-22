import { RadioGroup, RadioGroupItem, Label } from 'community-archive'

export const Default = () => (
  <RadioGroup defaultValue="public">
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="public" id="r-public" />
      <Label htmlFor="r-public">Public</Label>
    </div>
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="unlisted" id="r-unlisted" />
      <Label htmlFor="r-unlisted">Unlisted</Label>
    </div>
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="private" id="r-private" />
      <Label htmlFor="r-private">Private</Label>
    </div>
  </RadioGroup>
)

export const WithDescriptions = () => (
  <RadioGroup defaultValue="full" className="w-80 gap-4">
    <div className="flex items-start space-x-3">
      <RadioGroupItem value="full" id="rd-full" className="mt-0.5" />
      <div className="space-y-1">
        <Label htmlFor="rd-full">Full archive</Label>
        <p className="text-sm text-muted-foreground">Tweets, likes, followers and following.</p>
      </div>
    </div>
    <div className="flex items-start space-x-3">
      <RadioGroupItem value="tweets" id="rd-tweets" className="mt-0.5" />
      <div className="space-y-1">
        <Label htmlFor="rd-tweets">Tweets only</Label>
        <p className="text-sm text-muted-foreground">Skip likes and the social graph.</p>
      </div>
    </div>
  </RadioGroup>
)

export const Disabled = () => (
  <RadioGroup defaultValue="week">
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="week" id="rx-week" />
      <Label htmlFor="rx-week">Last 7 days</Label>
    </div>
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="month" id="rx-month" />
      <Label htmlFor="rx-month">Last 30 days</Label>
    </div>
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="all" id="rx-all" disabled />
      <Label htmlFor="rx-all">All time (requires upload)</Label>
    </div>
  </RadioGroup>
)
