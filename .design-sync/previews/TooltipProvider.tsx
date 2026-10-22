import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Button,
  Copy,
  Download,
  ExternalLink,
  Heart,
} from 'community-archive'

export const InContext = () => (
  <TooltipProvider>
    <div className="inline-flex items-center gap-1 rounded-md border bg-card p-1">
      <Button variant="ghost" size="icon" aria-label="Like count">
        <Heart className="h-4 w-4" />
      </Button>
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Copy tweet link">
            <Copy className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Copy tweet link</p>
        </TooltipContent>
      </Tooltip>
      <Button variant="ghost" size="icon" aria-label="Download JSON">
        <Download className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Open on X">
        <ExternalLink className="h-4 w-4" />
      </Button>
    </div>
  </TooltipProvider>
)
