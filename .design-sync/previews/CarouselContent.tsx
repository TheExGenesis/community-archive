import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  Card,
  CardContent,
} from 'community-archive'

const slides = [
  { title: 'Tweets archived', value: '6.4M' },
  { title: 'Accounts opted in', value: '412' },
  { title: 'Likes indexed', value: '18.2M' },
]

export const InContext = () => (
  <div className="px-12">
    <Carousel className="w-72">
      <CarouselContent>
        {slides.map((s) => (
          <CarouselItem key={s.title}>
            <Card>
              <CardContent className="flex h-48 flex-col items-center justify-center gap-1 p-6">
                <span className="text-4xl font-semibold">{s.value}</span>
                <span className="text-sm text-muted-foreground">{s.title}</span>
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
