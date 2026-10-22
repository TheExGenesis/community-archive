import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from 'community-archive'

export const InContext = () => (
  <div className="w-64">
    <Select defaultValue="week" defaultOpen>
      <SelectTrigger aria-label="Filter by time">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Recent</SelectLabel>
          <SelectItem value="today">Last 24h</SelectItem>
          <SelectItem value="week">Last 7 days</SelectItem>
          <SelectItem value="three-months">Last 3 months</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>By year</SelectLabel>
          <SelectItem value="year-2023">2023</SelectItem>
          <SelectItem value="year-2022" disabled>2022 (no tweets)</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
)
