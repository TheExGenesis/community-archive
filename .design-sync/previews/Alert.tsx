import {
  Alert,
  AlertTitle,
  AlertDescription,
  Button,
  Info,
  AlertCircle,
  RotateCcw,
} from 'community-archive'

export const Default = () => (
  <Alert className="max-w-md">
    <div className="flex gap-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <AlertTitle>Your archive is still processing</AlertTitle>
        <AlertDescription>
          We&apos;re indexing 48,212 tweets and 9,340 likes. Search results will
          fill in over the next few minutes.
        </AlertDescription>
      </div>
    </div>
  </Alert>
)

export const Destructive = () => (
  <Alert variant="destructive" className="max-w-md">
    <div className="flex gap-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <AlertTitle>Search could not be completed</AlertTitle>
        <AlertDescription>
          The search service timed out. Try a shorter query or fewer filters.
        </AlertDescription>
        <Button variant="outline" size="sm" className="mt-3">
          <RotateCcw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    </div>
  </Alert>
)

export const DescriptionOnly = () => (
  <div className="flex max-w-md flex-col gap-3">
    <Alert variant="destructive">
      <AlertDescription>
        That API key name is already in use. Pick a different name.
      </AlertDescription>
    </Alert>
    <Alert className="border-sky-200 bg-sky-50">
      <AlertDescription className="text-sky-900">
        <strong>Staging preview:</strong> no opt-in record was changed. Refresh
        this page to test the flow again.
      </AlertDescription>
    </Alert>
  </div>
)
