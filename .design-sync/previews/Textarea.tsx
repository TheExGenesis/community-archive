import { Textarea, Label, Button } from 'community-archive'

export const Default = () => (
  <div className="w-80">
    <Textarea placeholder="Describe what you're building with the archive…" />
  </div>
)

export const WithLabel = () => (
  <div className="grid gap-2" style={{ width: 384 }}>
    <Label htmlFor="t-bio">Project description</Label>
    <Textarea
      id="t-bio"
      defaultValue="A reading list built from the most-liked threads in the archive, grouped by topic."
    />
    <p className="text-xs text-muted-foreground">Shown on the community gallery. 280 characters max.</p>
  </div>
)

export const Disabled = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="t-dis">Reason for opting out</Label>
    <Textarea id="t-dis" disabled placeholder="Saving preferences…" />
  </div>
)

export const SubmissionForm = () => (
  <div className="grid gap-3" style={{ width: 384 }}>
    <Label htmlFor="t-sub">Tell us about your project</Label>
    <Textarea id="t-sub" placeholder="What does it do? Which parts of the archive does it use?" />
    <div className="flex justify-end gap-2">
      <Button variant="outline">Cancel</Button>
      <Button>Submit project</Button>
    </div>
  </div>
)
