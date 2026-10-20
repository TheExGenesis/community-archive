import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
} from 'community-archive'

export const InContext = () => (
  <Card className="w-[380px]">
    <CardHeader>
      <CardTitle>Create an API key</CardTitle>
      <CardDescription>
        Keys let scripts and notebooks query the archive. Treat them like a
        password.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Read-only access to public tweets and profiles</li>
        <li>1,000 requests per minute</li>
        <li>Revoke at any time from settings</li>
      </ul>
    </CardContent>
    <CardFooter className="justify-end gap-2">
      <Button variant="outline">Read the docs</Button>
      <Button>New API key</Button>
    </CardFooter>
  </Card>
)
