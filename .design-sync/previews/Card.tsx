import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from 'community-archive'

export const Default = () => (
  <Card className="w-[380px]">
    <CardHeader>
      <CardTitle>Upload your archive</CardTitle>
      <CardDescription>
        Add your Twitter data export to the Community Archive. You choose what
        becomes public.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm">
        We keep tweets, likes and follows. DMs and other private files are
        removed in your browser before anything is uploaded.
      </p>
    </CardContent>
    <CardFooter className="justify-between">
      <Button variant="outline">Learn more</Button>
      <Button>Choose file</Button>
    </CardFooter>
  </Card>
)

export const Stat = () => (
  <Card className="w-[240px]">
    <CardHeader className="pb-2">
      <CardDescription>Tweets archived</CardDescription>
      <CardTitle className="text-4xl">6,412,903</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-xs text-muted-foreground">+18,240 this week</p>
    </CardContent>
  </Card>
)

export const Profile = () => (
  <Card className="w-[380px]">
    <CardHeader className="flex flex-row items-start justify-between space-y-0">
      <div className="space-y-1.5">
        <CardTitle className="text-lg">@marginalia_fan</CardTitle>
        <CardDescription>Archive uploaded March 2024</CardDescription>
      </div>
      <Badge variant="secondary">Public</Badge>
    </CardHeader>
    <CardContent className="grid grid-cols-3 gap-4 text-sm">
      <div>
        <div className="font-semibold">412k</div>
        <div className="text-muted-foreground">Tweets</div>
      </div>
      <div>
        <div className="font-semibold">38k</div>
        <div className="text-muted-foreground">Likes</div>
      </div>
      <div>
        <div className="font-semibold">2.1k</div>
        <div className="text-muted-foreground">Following</div>
      </div>
    </CardContent>
  </Card>
)
