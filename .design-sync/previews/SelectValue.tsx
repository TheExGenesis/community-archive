import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Label } from 'community-archive'

export const InContext = () => (
  <div className="grid w-64 gap-2">
    <Label>Sort results</Label>
    <Select defaultValue="likes">
      <SelectTrigger aria-label="Sort results">
        <SelectValue placeholder="Sort tweets by…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="likes">Most liked</SelectItem>
        <SelectItem value="retweets">Most retweeted</SelectItem>
        <SelectItem value="recent">Most recent</SelectItem>
      </SelectContent>
    </Select>
  </div>
)
