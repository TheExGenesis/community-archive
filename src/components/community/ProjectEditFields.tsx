import { COMMUNITY_PROJECT_CATEGORIES } from '@/lib/communityProjects'

export type ProjectEditValues = {
  name: string
  projectUrl: string
  creatorName: string
  creatorHandle: string
  sourcePostUrl: string
  tags: string[]
  category: string
  description: string
  archiveUse: string
}

/** Field names match validateCommunitySubmission. */
export function ProjectEditFields({
  values,
  sourceOptional = false,
}: {
  values: ProjectEditValues
  sourceOptional?: boolean
}) {
  const optional = ['creatorHandle', 'tags']
  if (sourceOptional) optional.push('sourcePost')
  return (
    <>
      {(
        [
          ['projectName', 'App name', values.name, 120],
          ['projectUrl', 'Project URL', values.projectUrl, 2048],
          ['creatorName', 'Creator name', values.creatorName, 120],
          [
            'creatorHandle',
            'Creator X handle (optional)',
            values.creatorHandle,
            80,
          ],
          [
            'sourcePost',
            sourceOptional ? 'Source post URL (optional)' : 'Source post URL',
            values.sourcePostUrl,
            2048,
          ],
          ['tags', 'Tags (comma-separated)', values.tags.join(', '), 326],
        ] as const
      ).map(([name, label, value, maxLength]) => (
        <label key={name} className="grid gap-1 text-sm">
          {label}
          <input
            name={name}
            defaultValue={value}
            maxLength={maxLength}
            required={!optional.includes(name)}
            className="w-full rounded-md border border-input bg-background px-3 py-2"
          />
        </label>
      ))}
      <label className="grid gap-1 text-sm">
        Category
        <select
          name="category"
          defaultValue={values.category}
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
          defaultValue={values.description}
          required
          maxLength={360}
          className="rounded-md border border-input bg-background px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        How it uses the archive
        <textarea
          name="archiveUse"
          defaultValue={values.archiveUse}
          required
          maxLength={500}
          className="rounded-md border border-input bg-background px-3 py-2"
        />
      </label>
    </>
  )
}
