import { RadioGroup, RadioGroupItem, Label } from 'community-archive'

export const InContext = () => (
  <RadioGroup defaultValue="likes">
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="recent" id="ri-recent" />
      <Label htmlFor="ri-recent">Most recent</Label>
    </div>
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="likes" id="ri-likes" />
      <Label htmlFor="ri-likes">Most liked</Label>
    </div>
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="replies" id="ri-replies" disabled />
      <Label htmlFor="ri-replies">Most replied</Label>
    </div>
  </RadioGroup>
)
