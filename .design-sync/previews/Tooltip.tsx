import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Button,
  Copy,
  Info,
} from 'community-archive'

export const IconButton = () => (
  <TooltipProvider>
    <Tooltip open>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Copy API key">
          <Copy className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Copy API key</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

export const InfoTip = () => (
  <TooltipProvider>
    <div className="flex items-center gap-1.5 text-sm font-medium">
      Bangers
      <Tooltip open>
        <TooltipTrigger asChild>
          <button type="button" aria-label="What are bangers?" className="text-muted-foreground">
            <Info className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p>Tweets in the top 1% of likes for this account, across its whole archive.</p>
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
)

export const OnText = () => (
  <TooltipProvider>
    <p className="text-sm text-muted-foreground">
      Archive uploaded{' '}
      <Tooltip open>
        <TooltipTrigger asChild>
          <span className="font-medium text-foreground underline underline-offset-4">
            3 days ago
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Oct 17, 2026, 14:32 UTC</p>
        </TooltipContent>
      </Tooltip>
      {' '}· 48,210 tweets
    </p>
  </TooltipProvider>
)
