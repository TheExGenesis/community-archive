import filters from '@/lib/bulletin/candidate-filters.json'

export function CandidateFilters() {
  return (
    <section className="space-y-4 rounded-lg border bg-card p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Candidate filters</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          These rules decide which posts reach the classifier. Posts that miss
          the phrase or length checks are never sent to the model.
        </p>
      </div>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        <li>
          <strong>Eligible originals.</strong> Daily scans cover the previous
          two complete UTC days in ClickHouse. Keep permitted community members;
          exclude opt-outs, scrape blocks, deleted posts, replies, reposts, and
          text beginning with “RT @”.
        </li>
        <li>
          <strong>Phrase match.</strong> Raw text must match an offer, ask, or
          notice-prefix pattern, case-insensitively. Examples include “happy to
          help”, “DM me”, “office hours”, “looking for a”, “any
          recommendations”, and “Ask:”. These are examples, not the complete
          phrase list.
        </li>
        <li>
          <strong>Cleaned text check.</strong> Decode HTML entities, remove t.co
          links and leading mentions, and trim whitespace. Require at least 25
          characters and an ask or offer match. An opening request takes
          precedence over a weak offer phrase; strong offer phrases can override
          that preference.
        </li>
      </ol>
      <p className="text-sm text-muted-foreground">
        Unchanged classified posts reuse their saved decision. Remaining
        candidates go to the prompt below; membership and source are checked
        again before saving a notice. This panel is read-only.
      </p>
      <details className="rounded-md border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Exact phrase patterns and filtering code
        </summary>
        <p className="mt-3 text-xs text-muted-foreground">
          Generated from the worker source in this release. Worker and website
          deployments are separate. Filter fingerprint:{' '}
          {filters.sha256.slice(0, 12)}.
        </p>
        <div className="mt-4 space-y-4">
          {Object.entries({ ...filters.patterns, ...filters.functions }).map(
            ([name, value]) => (
              <div key={name}>
                <h3 className="font-mono text-xs font-semibold">{name}</h3>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs leading-5">
                  {value}
                </pre>
              </div>
            ),
          )}
        </div>
      </details>
    </section>
  )
}
