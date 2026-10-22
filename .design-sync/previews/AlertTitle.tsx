import { Alert, AlertTitle, AlertDescription, AlertTriangle } from 'community-archive'

export const InContext = () => (
  <Alert className="max-w-md">
    <div className="flex gap-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <AlertTitle>Some files were skipped</AlertTitle>
        <AlertDescription>
          Direct messages and account settings were removed in your browser
          before upload. Only tweets, likes and follows are archived.
        </AlertDescription>
      </div>
    </div>
  </Alert>
)
