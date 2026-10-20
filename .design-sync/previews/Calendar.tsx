import { Calendar, Card, CardHeader, CardTitle, CardDescription, CardContent } from 'community-archive'

export const Default = () => (
  <Calendar
    mode="single"
    month={new Date(2024, 2, 1)}
    selected={new Date(2024, 2, 14)}
    className="w-fit rounded-md border"
  />
)

export const Range = () => (
  <Calendar
    mode="range"
    month={new Date(2024, 2, 1)}
    selected={{ from: new Date(2024, 2, 4), to: new Date(2024, 2, 12) }}
    className="w-fit rounded-md border"
  />
)

export const WithDisabledDays = () => (
  <Card className="w-80">
    <CardHeader className="pb-2">
      <CardTitle className="text-lg">Tweets since</CardTitle>
      <CardDescription>Dates after your archive export are unavailable.</CardDescription>
    </CardHeader>
    <CardContent className="flex justify-center p-0 pb-4">
      <Calendar
        mode="single"
        month={new Date(2024, 2, 1)}
        selected={new Date(2024, 2, 8)}
        disabled={{ after: new Date(2024, 2, 20) }}
      />
    </CardContent>
  </Card>
)
