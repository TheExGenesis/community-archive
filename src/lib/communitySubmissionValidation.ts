import {
  COMMUNITY_PROJECT_CATEGORIES,
  type CommunityProjectCategory,
} from '@/lib/communityProjects'

export const COMMUNITY_COVER_BUCKET = 'community-project-covers'
export const COMMUNITY_COVER_MAX_BYTES = 5 * 1024 * 1024
export const COMMUNITY_COVER_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export type ValidCommunitySubmission = {
  name: string
  projectUrl: string
  creatorName: string
  creatorHandle: string | null
  category: CommunityProjectCategory
  description: string
  archiveUse: string
  sourcePostUrl: string
  sourceTweetId: string
  tags: string[]
  cover: File | null
}

export type CommunitySubmissionValidationResult =
  | { ok: true; value: ValidCommunitySubmission }
  | { ok: false; error: string }

const field = (formData: FormData, key: string) =>
  String(formData.get(key) ?? '').trim()

const parseHttpsUrl = (value: string, label: string) => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') throw new Error('HTTPS required')
    return url.toString()
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`)
  }
}

export function validateCommunitySubmission(
  formData: FormData,
): CommunitySubmissionValidationResult {
  const name = field(formData, 'projectName')
  const creatorName = field(formData, 'creatorName')
  const creatorHandle = field(formData, 'creatorHandle')
    .replace(/^@/, '')
    .toLowerCase()
  const category = field(formData, 'category')
  const description = field(formData, 'description')
  const archiveUse = field(formData, 'archiveUse')
  const rawTags = field(formData, 'tags')

  if (!name || name.length > 120) {
    return { ok: false, error: 'Project name must be 1–120 characters.' }
  }
  if (!creatorName || creatorName.length > 120) {
    return { ok: false, error: 'Creator name must be 1–120 characters.' }
  }
  if (creatorHandle && !/^[a-z0-9_]{1,80}$/.test(creatorHandle)) {
    return { ok: false, error: 'Enter a valid X handle.' }
  }
  if (
    !COMMUNITY_PROJECT_CATEGORIES.some(
      (item) => item !== 'All' && item === category,
    )
  ) {
    return { ok: false, error: 'Choose a valid project category.' }
  }
  if (!description || description.length > 360) {
    return { ok: false, error: 'Description must be 1–360 characters.' }
  }
  if (!archiveUse || archiveUse.length > 500) {
    return {
      ok: false,
      error: 'Archive-use explanation must be 1–500 characters.',
    }
  }

  let projectUrl: string
  let sourcePostUrl: string
  try {
    projectUrl = parseHttpsUrl(field(formData, 'projectUrl'), 'Project URL')
    sourcePostUrl = parseHttpsUrl(
      field(formData, 'sourcePost'),
      'Launch/source post',
    )
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Enter valid URLs.',
    }
  }

  const sourceUrl = new URL(sourcePostUrl)
  if (
    !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(
      sourceUrl.hostname,
    )
  ) {
    return { ok: false, error: 'Launch/source post must be an X post URL.' }
  }
  const sourceTweetId = sourceUrl.pathname.match(/\/status\/(\d{1,20})/)?.[1]
  if (!sourceTweetId) {
    return { ok: false, error: 'Launch/source post must include a post ID.' }
  }

  const tags = Array.from(
    new Set(
      rawTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  )
  if (tags.length > 8 || tags.some((tag) => tag.length > 40)) {
    return {
      ok: false,
      error: 'Use at most 8 comma-separated tags, up to 40 characters each.',
    }
  }

  const coverValue = formData.get('cover')
  const cover =
    coverValue instanceof File && coverValue.size > 0 ? coverValue : null
  if (cover) {
    if (cover.size > COMMUNITY_COVER_MAX_BYTES) {
      return { ok: false, error: 'Cover image must be 5MB or smaller.' }
    }
    if (!COMMUNITY_COVER_MIME_TYPES.some((type) => type === cover.type)) {
      return { ok: false, error: 'Cover must be a PNG, JPEG, or WebP image.' }
    }
  }

  return {
    ok: true,
    value: {
      name,
      projectUrl,
      creatorName,
      creatorHandle: creatorHandle || null,
      category: category as CommunityProjectCategory,
      description,
      archiveUse,
      sourcePostUrl,
      sourceTweetId,
      tags,
      cover,
    },
  }
}

export function communityProjectSlug(name: string, id: string) {
  const base = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
  return `${base || 'project'}-${id.slice(0, 8)}`
}

export function coverExtension(mimeType: string) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}
