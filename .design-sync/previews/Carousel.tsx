import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  Card,
  CardContent,
  Badge,
  Heart,
  MessageCircle,
} from 'community-archive'

const tweets = [
  { handle: '@quiet_lighthouse', text: 'Uploaded my archive today. Strange to see 11 years of half-formed thoughts indexed and searchable.', likes: 312, replies: 41 },
  { handle: '@moss_and_signal', text: 'The best thing about the archive: you can finally find that one thread from 2019 everyone half-remembers.', likes: 1204, replies: 88 },
  { handle: '@tidepool_notes', text: 'Opted in. Mostly for the future historians who want to know what we argued about.', likes: 96, replies: 12 },
  { handle: '@paper_kite_lab', text: 'Built a little notebook on top of the API: who replies to whom, by month.', likes: 540, replies: 33 },
]

export const Default = () => (
  <div className="px-12">
    <Carousel className="w-80">
      <CarouselContent>
        {tweets.map((t) => (
          <CarouselItem key={t.handle}>
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="text-sm font-semibold">{t.handle}</div>
                <p className="text-sm">{t.text}</p>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3" /> {t.likes}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" /> {t.replies}
                  </span>
                </div>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  </div>
)

const accounts = [
  { handle: '@quiet_lighthouse', tweets: '48k' },
  { handle: '@moss_and_signal', tweets: '112k' },
  { handle: '@tidepool_notes', tweets: '9.4k' },
  { handle: '@paper_kite_lab', tweets: '27k' },
  { handle: '@slow_orbit', tweets: '61k' },
]

export const MultipleItems = () => (
  <div className="px-12">
    <Carousel opts={{ align: 'start' }} style={{ width: 480 }}>
      <CarouselContent>
        {accounts.map((a) => (
          <CarouselItem key={a.handle} style={{ flexBasis: '33.333%' }}>
            <Card>
              <CardContent className="flex aspect-square flex-col items-center justify-center gap-2 p-4">
                <span className="text-2xl font-semibold">{a.tweets}</span>
                <span className="text-xs text-muted-foreground">{a.handle}</span>
                <Badge variant="secondary">Public</Badge>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  </div>
)
