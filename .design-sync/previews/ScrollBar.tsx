import { ScrollArea, ScrollBar } from 'community-archive'

const months = ['Jan 2019', 'Feb 2019', 'Mar 2019', 'Apr 2019', 'May 2019', 'Jun 2019', 'Jul 2019', 'Aug 2019']

export const InContext = () => (
  <ScrollArea type="always" className="whitespace-nowrap rounded-md border border-border" style={{ width: 384 }}>
    <div className="flex w-max gap-3 p-4">
      {months.map((m, i) => (
        <div key={m} className="w-28 shrink-0 rounded-md border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">{m}</div>
          <div className="text-lg font-semibold tabular-nums">{(1200 + i * 317).toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">tweets</div>
        </div>
      ))}
    </div>
    <ScrollBar orientation="horizontal" />
  </ScrollArea>
)
