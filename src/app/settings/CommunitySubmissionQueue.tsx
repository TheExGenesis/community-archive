'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
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
  type CommunityApprovalResult,
} from './communitySubmissionActions'

export function CommunitySubmissionQueue({
  initialProjects,
}: {
  initialProjects: CommunityProjectRow[]
}) {
  const [projects, setProjects] = useState(initialProjects)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const approve = (projectId: string) => {
    setMessage(null)
    const formData = new FormData()
    formData.set('projectId', projectId)
    startTransition(async () => {
      const result: CommunityApprovalResult =
        await approveCommunityProject(formData)
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      setProjects((current) =>
        current.filter((project) => project.id !== result.projectId),
      )
      setMessage('Project approved and published to the gallery.')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gallery submissions</CardTitle>
        <CardDescription>
          Signed-in community submissions awaiting approval. Approval publishes
          the project immediately; this first version has no edit or rejection
          flow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {message ? (
          <p className="mb-4 rounded-lg border border-border bg-muted/60 p-3 text-sm">
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
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() => approve(project.id)}
                    >
                      <Check className="mr-2 h-4 w-4" /> Approve
                    </Button>
                  </div>

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
            No Gallery submissions are waiting for approval.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
