import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Heart,
  MessageCircle,
} from 'community-archive'

const liked = [
  {
    author: '@wren_notes',
    text: 'Every archive upload is a small act of kindness to future researchers.',
    date: 'Jan 9, 2024',
    likes: 486,
    replies: 31,
  },
  {
    author: '@marshlands',
    text: 'Built a tiny app on the Community Archive API that finds your oldest mutual. Mine is from 2011.',
    date: 'Dec 21, 2023',
    likes: "1,320",
    replies: 94,
  },
]

export const InContext = () => (
  <Tabs defaultValue="likes" className="w-[380px]">
    <TabsList>
      <TabsTrigger value="tweets">Tweets</TabsTrigger>
      <TabsTrigger value="likes">Likes</TabsTrigger>
      <TabsTrigger value="followers">Followers</TabsTrigger>
    </TabsList>
    <TabsContent value="tweets">Tweets</TabsContent>
    <TabsContent value="likes">
      <div className="divide-y rounded-md border">
        {liked.map((t) => (
          <div key={t.date} className="space-y-2 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{t.author}</span>
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
    <TabsContent value="followers">Followers</TabsContent>
  </Tabs>
)
