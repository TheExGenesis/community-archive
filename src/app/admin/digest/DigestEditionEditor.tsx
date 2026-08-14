import {
  DIGEST_STORY_CATEGORIES,
  type DigestEdition,
  type DigestEditionContent,
} from '@/lib/digest/types'
import { saveDigestEditionAction } from './actions'
import { MarkdownField } from './MarkdownField'
import { SubmitButton } from './SubmitButton'

const fieldClass =
  'mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6'

export function DigestContentFields({
  content,
}: {
  content: DigestEditionContent
}) {
  const summary = content.executiveSummary.slice(0, 3)

  return (
    <>
      <fieldset className="space-y-3">
        <legend className="font-semibold">Three-bullet summary</legend>
        {[0, 1, 2].map((index) => (
          <div key={index} className="block text-xs font-semibold">
            <MarkdownField
              name={`summary_${index}`}
              label={`Bullet ${index + 1}`}
              defaultValue={summary[index] ?? ''}
              maxLength={300}
              editorClassName="font-serif text-base italic leading-6"
            />
          </div>
        ))}
      </fieldset>

      <label className="block text-xs font-semibold">
        Keywords, separated by commas
        <textarea
          name="keywords"
          defaultValue={content.keywords.join(', ')}
          rows={2}
          maxLength={800}
          required
          className={fieldClass}
        />
      </label>

      <div className="space-y-5">
        {content.stories.map((story, storyIndex) => (
          <fieldset
            key={`${story.slug}-${storyIndex}`}
            className="rounded-lg border p-4"
          >
            <legend className="px-2 font-semibold">
              Story {storyIndex + 1}
            </legend>
            <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <label className="block text-xs font-semibold">
                Type
                <select
                  name={`story_${storyIndex}_category`}
                  defaultValue={story.category ?? 'Other'}
                  className={fieldClass}
                >
                  {DIGEST_STORY_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <div className="block text-xs font-semibold">
                <MarkdownField
                  name={`story_${storyIndex}_title`}
                  label="Title"
                  defaultValue={story.title}
                  maxLength={300}
                  editorClassName="font-serif text-xl font-semibold leading-7"
                />
              </div>
            </div>
            <div className="mt-4 block text-xs font-semibold">
              <MarkdownField
                name={`story_${storyIndex}_subtitle`}
                label="Explanatory subtitle"
                defaultValue={story.subtitle}
                maxLength={500}
              />
            </div>
            <div className="mt-4 grid gap-3">
              {story.bullets.map((bullet, bulletIndex) => (
                <div
                  key={`${story.slug}-bullet-${bulletIndex}`}
                  className="block text-xs font-semibold"
                >
                  <MarkdownField
                    name={`story_${storyIndex}_bullet_${bulletIndex}`}
                    label={`In brief ${bulletIndex + 1}`}
                    defaultValue={bullet}
                    maxLength={220}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 block text-xs font-semibold">
              <MarkdownField
                name={`story_${storyIndex}_editorial_note`}
                label="Editor’s note"
                defaultValue={story.editorialNote ?? ''}
                maxLength={360}
              />
            </div>
          </fieldset>
        ))}
      </div>
    </>
  )
}

export function DigestEditionEditor({
  edition,
  runId,
}: {
  edition: DigestEdition
  runId: string
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Editable draft v{edition.version}
        </div>
        <h2 className="mt-1 text-xl font-semibold">Edit the edition inline</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Saving creates a new draft version, so earlier copy remains in the
          ledger.
        </p>
      </div>

      <form action={saveDigestEditionAction} className="mt-6 space-y-7">
        <input type="hidden" name="edition_id" value={edition.id} />
        <input type="hidden" name="run_id" value={runId} />

        <DigestContentFields content={edition.content} />

        <SubmitButton pendingLabel="Saving new draft…">
          Save as draft v{edition.version + 1}
        </SubmitButton>
      </form>
    </section>
  )
}
