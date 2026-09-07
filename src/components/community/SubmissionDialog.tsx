'use client'
import { FormEvent, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { COMMUNITY_PROJECT_CATEGORIES } from '@/lib/communityProjects'
export default function SubmissionDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [complete, setComplete] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setComplete(false)
      setError(null)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const formData = new window.FormData(event.currentTarget)

    try {
      const response = await fetch('/api/community/submissions', {
        method: 'POST',
        body: formData,
      })
      const result = (await response.json()) as { ok?: boolean; error?: string }
      if (response.status === 401) {
        window.location.href = '/login?redirect=/community'
        return
      }
      if (!response.ok || !result.ok) {
        setError(result.error ?? 'We could not save this submission.')
        return
      }
      setComplete(true)
    } catch {
      setError('We could not save this submission. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        {complete ? (
          <div className="py-4 text-center" aria-live="polite">
            <div className="bg-brand/15 mx-auto flex h-12 w-12 items-center justify-center rounded-full text-brand">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <DialogHeader className="mt-5 text-center">
              <DialogTitle className="text-center text-2xl">
                Your project is in the approval queue
              </DialogTitle>
              <DialogDescription className="mx-auto max-w-md leading-6">
                An admin will review it before it appears in Apps.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                Back to Apps
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setComplete(false)}
              >
                Submit another
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">Submit a project</DialogTitle>
              <DialogDescription className="leading-6">
                Share an independent tool, experiment, research project, or game
                built with Community Archive data.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="mt-2 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project name</Label>
                  <Input
                    id="project-name"
                    name="projectName"
                    autoComplete="off"
                    placeholder="What did you make?"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-url">Project URL</Label>
                  <Input
                    id="project-url"
                    name="projectUrl"
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="creator-name">Your name</Label>
                  <Input
                    id="creator-name"
                    name="creatorName"
                    autoComplete="name"
                    placeholder="Name or studio"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="creator-handle">X handle (optional)</Label>
                  <Input
                    id="creator-handle"
                    name="creatorHandle"
                    autoComplete="off"
                    placeholder="@handle"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-category">Category</Label>
                <Select name="category" defaultValue="Tools" required>
                  <SelectTrigger id="project-category">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMUNITY_PROJECT_CATEGORIES.filter(
                      (item) => item !== 'All',
                    ).map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-description">Short description</Label>
                <Textarea
                  id="project-description"
                  name="description"
                  placeholder="What does the project help people see, do, or understand?"
                  maxLength={360}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="archive-use">
                  How does it use Community Archive data?
                </Label>
                <Textarea
                  id="archive-use"
                  name="archiveUse"
                  placeholder="Tell curators which archive data or API the project uses."
                  maxLength={500}
                  required
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="source-post">Launch/source post</Label>
                  <Input
                    id="source-post"
                    name="sourcePost"
                    type="url"
                    inputMode="url"
                    placeholder="https://x.com/..."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-cover">Cover image (optional)</Label>
                  <Input
                    id="project-cover"
                    name="cover"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="cursor-pointer file:mr-3 file:border-0 file:bg-transparent file:text-xs file:font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-tags">Tags (optional)</Label>
                <Input
                  id="project-tags"
                  name="tags"
                  placeholder="audio, search, visualization"
                />
              </div>

              <p className="rounded-lg border border-border bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
                Submissions will be reviewed before appearing in Apps.
              </p>

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  {submitting ? 'Submitting…' : 'Submit for approval'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
