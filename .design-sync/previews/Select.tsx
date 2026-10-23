import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Label } from 'community-archive'

export const WithValue = () => (
  <div className="grid w-64 gap-2">
    <Label>Time range</Label>
    <Select defaultValue="week">
      <SelectTrigger>
        <SelectValue placeholder="Pick a range" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All time</SelectItem>
        <SelectItem value="today">Last 24h</SelectItem>
        <SelectItem value="week">Last 7 days</SelectItem>
        <SelectItem value="three-months">Last 3 months</SelectItem>
      </SelectContent>
    </Select>
  </div>
)

export const Placeholder = () => (
  <div className="w-64">
    <Select>
      <SelectTrigger>
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

export const Disabled = () => (
  <div className="w-64">
    <Select defaultValue="all" disabled>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All time</SelectItem>
      </SelectContent>
    </Select>
  </div>
)
