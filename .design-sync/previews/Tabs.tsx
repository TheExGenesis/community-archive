import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Label,
  Switch,
  Button,
  Badge,
  Heart,
  MessageCircle,
} from 'community-archive'

const tweets = [
  {
    text: 'Finally uploaded my archive. Eleven years of half-finished threads, now searchable by anyone who cares.',
    date: 'Mar 14, 2024',
    likes: 212,
    replies: 18,
  },
  {
    text: 'Hot take: the best part of any long thread is the reply where someone links the 2016 version of the same idea.',
    date: 'Feb 2, 2024',
    likes: "1,048",
    replies: 73,
  },
]

const followers = [
  { name: 'Ada Wren', handle: '@wren_notes', meta: 'Archive uploaded' },
  { name: 'Theo Marsh', handle: '@marshlands', meta: 'Streaming opt-in' },
  { name: 'Ines Okafor', handle: '@okafor_reads', meta: 'Archive uploaded' },
]

export const Default = () => (
  <Tabs defaultValue="tweets" className="w-[380px]">
    <TabsList>
      <TabsTrigger value="tweets">Tweets</TabsTrigger>
      <TabsTrigger value="likes">Likes</TabsTrigger>
      <TabsTrigger value="followers">Followers</TabsTrigger>
    </TabsList>
    <TabsContent value="tweets">
      <div className="divide-y rounded-md border">
        {tweets.map((t) => (
          <div key={t.date} className="space-y-2 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">@marginalia_fan</span>
              <span>{t.date}</span>
            </div>
            <p className="text-sm">{t.text}</p>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Heart className="h-3 w-3" /> {t.likes}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="h-3 w-3" /> {t.replies}
              </span>
            </div>
          </div>
        ))}
      </div>
    </TabsContent>
    <TabsContent value="likes">Liked tweets</TabsContent>
    <TabsContent value="followers">Followers</TabsContent>
  </Tabs>
)

export const Followers = () => (
  <Tabs defaultValue="followers" className="w-[380px]">
    <TabsList>
      <TabsTrigger value="tweets">Tweets</TabsTrigger>
      <TabsTrigger value="likes">Likes</TabsTrigger>
      <TabsTrigger value="followers">Followers</TabsTrigger>
      <TabsTrigger value="dms" disabled>
        DMs
      </TabsTrigger>
    </TabsList>
    <TabsContent value="tweets">Tweets</TabsContent>
    <TabsContent value="likes">Liked tweets</TabsContent>
    <TabsContent value="followers">
      <ul className="divide-y rounded-md border">
        {followers.map((f) => (
          <li key={f.handle} className="flex items-center justify-between p-3">
            <div>
              <div className="text-sm font-semibold">{f.name}</div>
              <div className="text-xs text-muted-foreground">{f.handle}</div>
            </div>
            <Badge variant="secondary">{f.meta}</Badge>
          </li>
        ))}
      </ul>
    </TabsContent>
  </Tabs>
)

export const FullWidth = () => (
  <Tabs defaultValue="privacy" className="w-[380px]">
    <TabsList className="grid w-full grid-cols-3">
      <TabsTrigger value="privacy">Privacy</TabsTrigger>
      <TabsTrigger value="archives">My Archives</TabsTrigger>
      <TabsTrigger value="tweets">My Tweets</TabsTrigger>
    </TabsList>
    <TabsContent value="privacy">
      <Card>
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-lg">Tweet streaming</CardTitle>
          <CardDescription>
            Control how your tweets are collected and stored
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="opt-in">Opt-in to streaming</Label>
              <div className="text-sm text-muted-foreground">
                Archive your public tweets automatically
              </div>
            </div>
            <Switch id="opt-in" defaultChecked />
          </div>
          <Button variant="outline" size="sm">
            Download my archive
          </Button>
        </CardContent>
      </Card>
    </TabsContent>
    <TabsContent value="archives">Archives</TabsContent>
    <TabsContent value="tweets">Tweets</TabsContent>
  </Tabs>
)
