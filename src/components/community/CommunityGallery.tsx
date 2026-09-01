'use client'

import Image from 'next/image'
import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  CheckCircle2,
  Heart,
  MessageCircle,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
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
import {
  COMMUNITY_PROJECT_CATEGORIES,
  COMMUNITY_PROJECTS,
  CommunityProject,
  CommunityProjectSort,
  filterCommunityProjects,
} from '@/lib/communityProjects'
import { cn } from '@/utils/tailwind'

const SORT_OPTIONS: CommunityProjectSort[] = [
  'Featured',
  'Newest',
  'Most liked',
  'A–Z',
]

type LikeState = { liked: boolean; count: number }

function LikeButton({
  project,
  state,
  onToggle,
  size = 'card',
  isSignedIn = true,
}: {
  project: CommunityProject
  state: LikeState
  onToggle: (project: CommunityProject) => void
  size?: 'card' | 'modal'
  isSignedIn?: boolean
}) {
  const label = !isSignedIn
    ? 'Sign in to like'
    : `${state.liked ? 'Unlike' : 'Like'} ${project.name}`
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onToggle(project)
      }}
      aria-pressed={state.liked}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold transition-colors',
        size === 'modal'
          ? 'h-9 border-border px-3.5 text-[13px]'
          : 'h-7 border-transparent px-2 text-[12.5px]',
        state.liked
          ? 'text-brand hover:text-brand/80'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Heart
        className={cn('h-4 w-4', state.liked && 'fill-current')}
        aria-hidden="true"
      />
      <span>{state.count}</span>
    </button>
  )
}

const MAX_COMMENT_LENGTH = 2000

const LOGIN_REDIRECT = '/login?redirect=/community'

interface ProjectComment {
  id: string
  content: string
  username: string | null
  displayName: string | null
  createdAt: string
  isOwn: boolean
}

function commentAuthor(comment: ProjectComment) {
  return (
    comment.displayName ??
    (comment.username ? `@${comment.username}` : 'A member')
  )
}

/**
 * The detail modal's comment thread. Owns its own list state and fetches once
 * per project id, so the parent never has to hand it a freshly built array.
 */
function ProjectComments({
  projectId,
  isSignedIn,
  onCountChange,
}: {
  projectId: string
  isSignedIn: boolean
  onCountChange: (projectId: string, count: number) => void
}) {
  const [comments, setComments] = useState<ProjectComment[] | null>(null)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setComments(null)
    setError(null)
    setDraft('')

    void (async () => {
      try {
        const response = await fetch(
          `/api/community/projects/${projectId}/comments`,
        )
        if (!response.ok) throw new Error('comments failed')
        const result = (await response.json()) as {
          comments?: ProjectComment[]
        }
        if (!active) return
        setComments(result.comments ?? [])
      } catch {
        if (!active) return
        setComments([])
        setError('We could not load comments. Please try again.')
      }
    })()

    return () => {
      active = false
    }
  }, [projectId])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/community/projects/${projectId}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        },
      )
      if (response.status === 401) {
        window.location.href = LOGIN_REDIRECT
        return
      }
      if (!response.ok) throw new Error('comment failed')
      const result = (await response.json()) as { comment?: ProjectComment }
      if (!result.comment) throw new Error('comment failed')

      const next = [...(comments ?? []), result.comment]
      setComments(next)
      onCountChange(projectId, next.length)
      setDraft('')
    } catch {
      setError('We could not post your comment. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async (commentId: string) => {
    const previous = comments ?? []
    setComments(previous.filter((comment) => comment.id !== commentId))
    onCountChange(projectId, previous.length - 1)
    try {
      const response = await fetch(
        `/api/community/projects/${projectId}/comments/${commentId}`,
        { method: 'DELETE' },
      )
      if (!response.ok) throw new Error('delete failed')
    } catch {
      setComments(previous)
      onCountChange(projectId, previous.length)
      setError('We could not delete that comment. Please try again.')
    }
  }

  return (
    <section className="border-t border-border pt-4">
      <h3 className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
        Comments
      </h3>

      {comments === null ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No comments yet. Be the first to say something.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="bg-muted/45 rounded-xl border border-border px-[18px] py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold">
                  {commentAuthor(comment)}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[12.5px] text-muted-foreground">
                    {new Date(comment.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </span>
                  {comment.isOwn ? (
                    <button
                      type="button"
                      onClick={() => void remove(comment.id)}
                      aria-label="Delete your comment"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-[1.6]">
                {comment.content}
              </p>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isSignedIn ? (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
          <label htmlFor="community-comment" className="sr-only">
            Add a comment
          </label>
          <Textarea
            id="community-comment"
            name="comment"
            value={draft}
            maxLength={MAX_COMMENT_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a comment"
            className="min-h-[80px]"
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={submitting || !draft.trim()}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {submitting ? 'Posting…' : 'Post comment'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          <Link
            href={LOGIN_REDIRECT}
            className="font-semibold text-brand hover:underline"
          >
            Sign in
          </Link>{' '}
          to join the conversation.
        </p>
      )}
    </section>
  )
}

const CURATED_SECTIONS = [
  {
    category: 'Tools',
    blurb: 'Things that make the archive easier to actually use.',
  },
  {
    category: 'Experiments',
    blurb: 'New ways to remix and interact with the archive.',
  },
  {
    category: 'Research',
    blurb: 'Studies and discoveries made from archive data.',
  },
  {
    category: 'Games',
    blurb: 'The archive used for no productive reason whatsoever.',
  },
] as const

function ProjectCover({
  project,
  modal = false,
}: {
  project: CommunityProject
  modal?: boolean
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden border border-border bg-gradient-to-br',
        modal ? 'h-[200px] border-x-0 border-t-0' : 'aspect-[16/10] rounded-xl',
        project.coverClass,
      )}
    >
      {project.image ? (
        <>
          <Image
            src={project.image}
            alt={`Preview of ${project.name}`}
            fill
            sizes={modal ? '620px' : '(max-width: 940px) 100vw, 33vw'}
            className="object-cover"
          />
          {modal ? (
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,39,51,0.5)_0%,rgba(5,39,51,0.1)_45%,rgba(5,39,51,0.82)_100%)]" />
          ) : null}
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(10,53,71,0.18)_1.6px,transparent_0)] bg-[length:14px_14px]" />
      )}
      {modal || !project.image ? (
        <div
          className={cn(
            'absolute inset-0 flex flex-col p-5',
            modal && 'px-6 py-5 text-[#EAF7FD]',
            !modal && 'text-[#0A3547]',
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-75">
            {project.category}
          </div>
          <div
            className={cn(
              'text-balance mt-auto max-w-[13ch] font-serif font-bold leading-[1.05]',
              modal ? 'text-[44px]' : 'text-[32px]',
            )}
          >
            {project.name}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ProjectCard({
  project,
  onOpen,
}: {
  project: CommunityProject
  onOpen: () => void
}) {
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className="group block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <ProjectCover project={project} />
        <span className="mt-3 flex items-baseline justify-between gap-3">
          <span className="text-[15.5px] font-bold tracking-[-0.005em]">
            {project.name}
          </span>
        </span>
        <span className="mt-1 block text-[13.5px] text-muted-foreground">
          by{' '}
          <span className="font-semibold text-foreground">
            {project.creator}
          </span>{' '}
          · Free
        </span>
      </button>
    </div>
  )
}

function ProjectDialog({
  project,
  onOpenChange,
  likeState,
  onToggleLike,
  isSignedIn,
}: {
  project: CommunityProject | null
  onOpenChange: (open: boolean) => void
  likeState?: LikeState
  onToggleLike: (project: CommunityProject) => void
  isSignedIn: boolean
}) {
  return (
    <Dialog open={Boolean(project)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[620px] gap-0 overflow-y-auto p-0">
        {project ? (
          <>
            <ProjectCover project={project} modal />
            <div className="relative z-10 flex flex-col gap-[15px] bg-background px-[26px] pb-[26px] pt-[22px]">
              <DialogHeader className="text-left">
                <DialogTitle className="text-[28px] leading-tight">
                  {project.name}
                </DialogTitle>
                <DialogDescription className="leading-6 text-muted-foreground">
                  {project.description}
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center gap-2.5">
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-muted font-serif text-sm font-extrabold">
                  {project.creator.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{project.creator}</div>
                  <div className="text-[12.5px] text-muted-foreground">
                    Added{' '}
                    {new Date(project.publishedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </div>
                </div>
                {likeState ? (
                  <LikeButton
                    project={project}
                    state={likeState}
                    onToggle={onToggleLike}
                    size="modal"
                    isSignedIn={isSignedIn}
                  />
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="bg-muted/45 rounded-xl border border-border px-[18px] py-4">
                <h3 className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                  How it uses the archive
                </h3>
                <p className="mt-2 text-sm leading-[1.6]">
                  {project.archiveUse}
                </p>
              </div>
              {/* Comments are built (see ProjectComments + the comments API)
                  but hidden from the gallery for now. */}
              <DialogFooter>
                <Button asChild variant="outline">
                  <Link
                    href={
                      project.sourceUrl ?? `/tweets/${project.sourceTweetId}`
                    }
                    target={project.sourceUrl ? '_blank' : undefined}
                    rel={project.sourceUrl ? 'noopener noreferrer' : undefined}
                  >
                    View source post
                  </Link>
                </Button>
                {project.projectUrl ? (
                  <Button
                    asChild
                    className="bg-brand text-brand-foreground hover:bg-brand/90"
                  >
                    <a
                      href={project.projectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open project <ArrowUpRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
              </DialogFooter>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SubmissionDialog({
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
                An admin will review it before it appears in the Gallery.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                Back to gallery
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
                Submissions will be reviewed before appearing in the gallery.
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

export default function CommunityGallery({
  isSignedIn = true,
  publishedProjects = [],
  likedProjectIds = [],
}: {
  isSignedIn?: boolean
  publishedProjects?: CommunityProject[]
  likedProjectIds?: string[]
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] =
    useState<(typeof COMMUNITY_PROJECT_CATEGORIES)[number]>('All')
  const [sort, setSort] = useState<CommunityProjectSort>('Featured')
  const [selectedProject, setSelectedProject] =
    useState<CommunityProject | null>(null)
  const [submissionOpen, setSubmissionOpen] = useState(false)

  // Server-rendered like counts stay the source of truth; only projects the
  // reader has toggled in this session carry a local override.
  const [likeOverrides, setLikeOverrides] = useState<Record<string, LikeState>>(
    {},
  )

  const serverLikes = useMemo(() => {
    const liked = new Set(likedProjectIds)
    return new Map<string, LikeState>(
      publishedProjects
        .filter((project) => project.databaseId)
        .map((project) => [
          project.databaseId!,
          {
            liked: liked.has(project.databaseId!),
            count: project.likeCount ?? 0,
          },
        ]),
    )
  }, [publishedProjects, likedProjectIds])

  const likes = useMemo(() => {
    const merged: Record<string, LikeState> = Object.fromEntries(serverLikes)
    return { ...merged, ...likeOverrides }
  }, [serverLikes, likeOverrides])

  const baseCatalog = useMemo(() => {
    const bySlug = new Map(
      COMMUNITY_PROJECTS.map((project) => [project.slug, project]),
    )
    for (const project of publishedProjects) {
      // A backfilled database row has no uploaded cover; keep the curated
      // catalog's artwork for the same slug so the card doesn't regress.
      const curated = bySlug.get(project.slug)
      bySlug.set(project.slug, {
        ...project,
        image: project.image ?? curated?.image,
        coverClass: curated?.coverClass ?? project.coverClass,
      })
    }
    return Array.from(bySlug.values())
  }, [publishedProjects])

  const catalog = useMemo(
    () =>
      baseCatalog.map((project) => {
        const state = project.databaseId ? likes[project.databaseId] : undefined
        return state ? { ...project, likeCount: state.count } : project
      }),
    [baseCatalog, likes],
  )

  const projects = useMemo(
    () => filterCommunityProjects(catalog, query, category, sort),
    [catalog, category, query, sort],
  )

  const toggleLike = useCallback(
    (project: CommunityProject) => {
      const id = project.databaseId
      if (!id) return
      if (!isSignedIn) {
        window.location.href = '/login?redirect=/community'
        return
      }

      const previous = likes[id] ?? { liked: false, count: 0 }
      const next: LikeState = {
        liked: !previous.liked,
        count: Math.max(0, previous.count + (previous.liked ? -1 : 1)),
      }
      setLikeOverrides((current) => ({ ...current, [id]: next }))

      void (async () => {
        try {
          const response = await fetch(`/api/community/projects/${id}/like`, {
            method: next.liked ? 'POST' : 'DELETE',
          })
          if (response.status === 401) {
            window.location.href = '/login?redirect=/community'
            return
          }
          if (!response.ok) throw new Error('like failed')
          const result = (await response.json()) as {
            liked?: boolean
            count?: number
          }
          setLikeOverrides((current) => ({
            ...current,
            [id]: {
              liked: result.liked ?? next.liked,
              count: result.count ?? next.count,
            },
          }))
        } catch {
          setLikeOverrides((current) => ({ ...current, [id]: previous }))
        }
      })()
    },
    [isSignedIn, likes],
  )

  const likeStateFor = (project: CommunityProject) =>
    project.databaseId ? (likes[project.databaseId] ?? undefined) : undefined

  const isCurated = category === 'All' && query.trim() === ''
  const openSubmission = () => {
    if (!isSignedIn) {
      window.location.href = '/login?redirect=/community'
      return
    }
    setSubmissionOpen(true)
  }

  return (
    <main className="min-h-screen bg-background">
      <section>
        <div className="mx-auto max-w-[1280px] px-5 pb-10 pt-[60px] min-[940px]:px-7">
          <div className="text-center">
            <h1
              aria-label="Discover community-made tools, bots, visualizations, and more"
              className="text-balance mx-auto max-w-[840px] text-[38px] font-bold leading-[1.06] tracking-[-0.02em]"
            >
              Discover community-made{' '}
              <span className="text-brand-icon">tools,</span>
              <br />
              <span className="text-brand-icon">bots,</span>{' '}
              <span className="text-brand-icon">visualizations,</span> and more
            </h1>
            <p className="mx-auto mt-3 max-w-[560px] text-[17px] leading-[1.55] text-muted-foreground">
              Explore tools built on top of the community archive
            </p>
            <label className="relative mx-auto mt-7 block max-w-[520px]">
              <span className="sr-only">Search community projects</span>
              <Search className="pointer-events-none absolute left-[18px] top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search community projects…"
                className="h-11 rounded-full bg-transparent pl-11 text-sm shadow-none"
              />
            </label>
          </div>
        </div>
      </section>

      <div className="sticky top-14 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-5 py-[11px] min-[940px]:flex-row min-[940px]:items-center min-[940px]:justify-between min-[940px]:px-7">
          <div
            className="flex gap-1.5 overflow-x-auto pb-1 min-[940px]:pb-0"
            aria-label="Project categories"
          >
            {COMMUNITY_PROJECT_CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                aria-pressed={category === item}
                className={cn(
                  'h-[34px] whitespace-nowrap rounded-full border px-[13px] text-[13px] font-semibold',
                  category === item
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border bg-transparent text-foreground hover:border-brand',
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className="flex gap-0.5 rounded-lg bg-muted p-[3px]"
              aria-label="Sort projects"
            >
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSort(option)}
                  aria-pressed={sort === option}
                  className={cn(
                    'rounded-md px-3 py-[5px] text-[12.5px] font-semibold',
                    sort === option
                      ? 'bg-background text-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.08)]'
                      : 'text-muted-foreground',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            <Button
              type="button"
              size="sm"
              onClick={openSubmission}
              className="h-9 bg-primary text-primary-foreground"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Submit a project
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-5 pb-20 min-[940px]:px-7">
        {isCurated ? (
          <span className="sr-only">
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </span>
        ) : null}

        {projects.length && isCurated
          ? CURATED_SECTIONS.map((section) => {
              const sectionProjects = projects
                .filter((project) => project.category === section.category)
                .slice(0, 3)
              if (!sectionProjects.length) return null

              return (
                <section key={section.category} className="pb-12 pt-[38px]">
                  <div className="mb-5 flex flex-wrap items-end justify-between gap-5">
                    <div>
                      <h2 className="text-2xl font-bold">{section.category}</h2>
                      <p className="mt-1 text-[14.5px] text-muted-foreground">
                        {section.blurb}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCategory(section.category)}
                      className="text-sm font-semibold text-brand"
                    >
                      Browse all {section.category.toLowerCase()} ›
                    </button>
                  </div>
                  <div
                    className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-[26px]"
                    style={{ maxWidth: sectionProjects.length * 380 }}
                  >
                    {sectionProjects.map((project) => (
                      <ProjectCard
                        key={project.slug}
                        project={project}
                        onOpen={() => setSelectedProject(project)}
                      />
                    ))}
                  </div>
                </section>
              )
            })
          : null}

        {projects.length && !isCurated ? (
          <section className="py-[38px]">
            <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-border pb-3">
              <h2 className="text-[26px] font-bold">
                {query.trim() ? 'Search results' : category}
              </h2>
              <span className="text-[13px] text-muted-foreground">
                {projects.length}{' '}
                {projects.length === 1 ? 'project' : 'projects'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-[26px] sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.slug}
                  project={project}
                  onOpen={() => setSelectedProject(project)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!projects.length ? (
          <section className="py-[38px]">
            <div className="flex flex-col items-center gap-3.5 rounded-2xl border border-dashed border-border px-5 py-20 text-center">
              <h2 className="text-3xl font-bold">Nothing here yet</h2>
              <p className="max-w-[430px] text-[15px] leading-[1.6] text-muted-foreground">
                Nothing matches{' '}
                {query.trim() ? `“${query.trim()}”` : 'that filter'}. Which
                might mean nobody has built it — a decent reason to build it.
              </p>
              <div className="mt-1.5 flex gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setQuery('')
                    setCategory('All')
                  }}
                >
                  Clear filters
                </Button>
                <Button type="button" onClick={openSubmission}>
                  Submit a project
                </Button>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <ProjectDialog
        project={selectedProject}
        onOpenChange={(open) => !open && setSelectedProject(null)}
        likeState={selectedProject ? likeStateFor(selectedProject) : undefined}
        onToggleLike={toggleLike}
        isSignedIn={isSignedIn}
      />
      <SubmissionDialog
        open={submissionOpen}
        onOpenChange={setSubmissionOpen}
      />
    </main>
  )
}
