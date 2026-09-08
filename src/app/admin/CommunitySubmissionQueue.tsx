'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { COMMUNITY_PROJECT_CATEGORIES } from '@/lib/communityProjects'
import { Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { CommunityProjectRow } from '@/lib/communityProjectDatabase'
import {
  approveCommunityProject,
  editCommunityProject,
  deleteCommunityProject,
  type CommunityApprovalResult,
} from './communitySubmissionActions'

export function CommunitySubmissionQueue({
  initialProjects,
}: {
  initialProjects: CommunityProjectRow[]
}) {
  const [projects, setProjects] = useState(initialProjects)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, setPending] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const router = useRouter()
  useEffect(() => {
    setProjects(initialProjects)
  }, [initialProjects])

  const mutate = async (
    action: (data: FormData) => Promise<CommunityApprovalResult>,
    formData: FormData,
    success: string,
    remove = false,
  ) => {
    setMessage(null)
    setFailed(false)
    setPending(true)
    try {
      const result = await action(formData)
      if (!result.ok) {
        setFailed(true)
        setMessage(result.error)
        return
      }
      if (remove)
        setProjects((current) =>
          current.filter((project) => project.id !== result.projectId),
        )
      setEditing(null)
      setDeleting(null)
      setMessage(success)
      router.refresh()
    } catch {
      setFailed(true)
      setMessage('The change could not be saved. Please try again.')
    } finally {
      setPending(false)
    }
  }
  const projectData = (projectId: string) => {
    const data = new FormData()
    data.set('projectId', projectId)
    return data
  }
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void mutate(
      editCommunityProject,
      new FormData(event.currentTarget),
      'Submission saved.',
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>App submissions</CardTitle>
        <CardDescription>
          The oldest 50 submissions awaiting review. Edit details before
          approving, or delete a submission. Approval publishes the app
          immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {message ? (
          <p
            role={failed ? 'alert' : 'status'}
            className="mb-4 rounded-lg border border-border bg-muted/60 p-3 text-sm"
          >
            {message}
          </p>
        ) : null}

        {projects.length ? (
          <div className="space-y-5">
            {projects.map((project) => (
              <article
                key={project.id}
                className="grid gap-5 rounded-xl border border-border p-4 sm:grid-cols-[180px_1fr]"
              >
                <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-border bg-muted">
                  {project.cover_storage_path ? (
                    <Image
                      src={`/api/community/projects/${project.id}/cover`}
                      alt={`Submitted cover for ${project.name}`}
                      fill
                      sizes="180px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-end p-4 font-serif text-xl font-bold">
                      {project.name}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                        {project.category}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold">
                        {project.name}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        by {project.creator_name} · submitted by @
                        {project.submitter_username}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => {
                          setEditing(project.id)
                          setDeleting(null)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => {
                          setDeleting(project.id)
                          setEditing(null)
                        }}
                      >
                        Delete
                      </Button>
                      <Button
                        type="button"
                        disabled={
                          isPending ||
                          editing === project.id ||
                          deleting === project.id
                        }
                        onClick={() =>
                          void mutate(
                            approveCommunityProject,
                            projectData(project.id),
                            'Project approved and published to Apps.',
                            true,
                          )
                        }
                      >
                        <Check className="mr-2 h-4 w-4" /> Approve
                      </Button>
                    </div>
                  </div>

                  {deleting === project.id && (
                    <div className="mt-4 rounded-lg border border-destructive p-3">
                      <p className="text-sm">
                        Delete “{project.name}”? This cannot be undone.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="destructive"
                          disabled={isPending}
                          onClick={() =>
                            void mutate(
                              deleteCommunityProject,
                              projectData(project.id),
                              'Submission deleted.',
                              true,
                            )
                          }
                        >
                          Confirm delete
                        </Button>
                        <Button
                          variant="outline"
                          disabled={isPending}
                          onClick={() => setDeleting(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                  {editing === project.id && (
                    <form
                      onSubmit={save}
                      className="mt-4 grid gap-3"
                      aria-label={`Edit ${project.name}`}
                    >
                      <input
                        type="hidden"
                        name="projectId"
                        value={project.id}
                      />
                      <fieldset disabled={isPending} className="grid gap-3">
                        {(
                          [
                            ['projectName', 'App name', project.name, 120],
                            [
                              'projectUrl',
                              'Project URL',
                              project.project_url,
                              2048,
                            ],
                            [
                              'creatorName',
                              'Creator name',
                              project.creator_name,
                              120,
                            ],
                            [
                              'creatorHandle',
                              'Creator X handle (optional)',
                              project.creator_handle ?? '',
                              80,
                            ],
                            [
                              'sourcePost',
                              'Source post URL',
                              project.source_post_url,
                              2048,
                            ],
                            [
                              'tags',
                              'Tags (comma-separated)',
                              project.tags.join(', '),
                              326,
                            ],
                          ] as const
                        ).map(([name, label, value, maxLength]) => (
                          <label key={name} className="grid gap-1 text-sm">
                            {label}
                            <input
                              name={name}
                              defaultValue={value}
                              maxLength={maxLength}
                              required={
                                !['creatorHandle', 'tags'].includes(name)
                              }
                              className="w-full rounded-md border border-input bg-background px-3 py-2"
                            />
                          </label>
                        ))}
                        <label className="grid gap-1 text-sm">
                          Category
                          <select
                            name="category"
                            defaultValue={project.category}
                            className="rounded-md border border-input bg-background px-3 py-2"
                          >
                            {COMMUNITY_PROJECT_CATEGORIES.filter(
                              (category) => category !== 'All',
                            ).map((category) => (
                              <option key={category}>{category}</option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm">
                          Description
                          <textarea
                            name="description"
                            defaultValue={project.description}
                            required
                            maxLength={360}
                            className="rounded-md border border-input bg-background px-3 py-2"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          How it uses the archive
                          <textarea
                            name="archiveUse"
                            defaultValue={project.archive_use}
                            required
                            maxLength={500}
                            className="rounded-md border border-input bg-background px-3 py-2"
                          />
                        </label>
                        <div className="flex gap-2">
                          <Button type="submit">
                            {isPending ? 'Saving…' : 'Save changes'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </fieldset>
                    </form>
                  )}

                  <p className="mt-4 text-sm leading-6">
                    {project.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    <Link
                      href={project.project_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1"
                    >
                      Project <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href={project.source_post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1"
                    >
                      Source post <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            No App submissions are waiting for approval.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
