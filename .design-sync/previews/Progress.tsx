import { Progress } from 'community-archive'

export const Default = () => (
  <div className="w-80">
    <Progress value={62} />
  </div>
)

export const Values = () => (
  <div className="flex w-80 flex-col gap-4">
    <Progress value={0} />
    <Progress value={25} />
    <Progress value={70} />
    <Progress value={100} />
  </div>
)

export const UploadStatus = () => (
  <div className="w-80 space-y-2 rounded-lg border border-border bg-card p-4">
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium">Uploading tweets…</span>
      <span className="tabular-nums text-muted-foreground">48%</span>
    </div>
    <Progress value={48} className="h-2" />
    <p className="text-xs text-muted-foreground">23,140 of 48,212 tweets</p>
  </div>
)
