# Daily Digest

The Daily Digest turns a frozen 24-hour snapshot of recent bangers into three
to five readable stories. A dated edition runs from 06:00 UTC on its date to
05:59 UTC the following date. This keeps the beginning of the European morning
and the same-date evening on the US West Coast in one editorial day, including
through daylight-saving changes. Public pages are fixed publication artifacts;
the private lab keeps the exact inputs, prompt version, model response, usage,
and stage-by-stage trace needed to reproduce and compare generations.

## Product surfaces

- `/digest` shows the latest published edition.
- `/digest/YYYY-MM-DD` is the permanent daily-edition URL.
- `/digest/YYYY-MM-DD/story-slug` is a linkable story page with bangers and
  selected archived quote-post commentary.
- `/admin/digest` is restricted by the existing production admin identity gate.
  It creates snapshots, edits inclusion, forks prompts, generates output,
  stages versions, and publishes one version per day. Its calendar covers the
  previous 12 completed months.

The global navigation and homepage digest card expose only published editions.
Drafts, raw responses, prompts, and failures never cross the public RLS policy.

### Preview fixture

Vercel preview deployments and local development include a clearly labeled
August 11, 2026 mock edition at `/digest/2026-08-11`. It is assembled from the
August 11 banger-cluster research memo and uses hydrated tweet snapshots, but it
never writes to `digest_editions` and is disabled in production. The edition
view includes a calendar-style day selector; only dates with a real or preview
edition are clickable.

Story cards use the canonical full-fidelity `TweetCard`: text is never clamped,
and archived media, video thumbnails, and quoted tweets remain visible. Every
story carries one intentionally loose editorial label. Current labels include
`AI news`, `News`, `Viral joke`, `Meme`, `Culture`, `Opportunity`, and `Other`;
they are useful shelves rather than a formal taxonomy. Edition keywords remain
separate, must occur verbatim in the supplied posts, and link to the existing
archive search.

Story titles borrow maximally from the supplied tweets rather than behaving
like generated newsletter headlines. An exact three- to eighteen-word excerpt
is preferred; a clear paraphrase is retained as an editorial warning instead
of failing an otherwise grounded generation. The generated
subtitle must supply the people, event, and significance that the source quote
leaves unstated rather than merely restating it. The story page keeps
source-grounded `In brief` bullets and a short editor's note for interpretation
or caveats. The edition abstract is exactly three concrete bullet sentences so
a reader can scan the day's developments before opening a story. When the
stories do not reduce cleanly, bullet three briefly catches the remaining
stories.

### Editorial presentation

The public edition adopts a newspaper-like, unboxed reading surface: a ruled
masthead, large date, italic standfirst, main editorial column, and quiet
calendar/context sidebar. Stories use strong rules and generous spacing rather
than independent dashboard cards. Standalone cover images are omitted; story
media appears in context inside the canonical tweet cards instead.

Digest tweet presentation is an `editorial` variant of the canonical
`TweetCard`, not a separate renderer. It changes only the surrounding type,
spacing, and rules; full text, media, videos, quoted tweets, metrics, links, and
analytics behavior remain owned by the shared component. The story page uses
the same treatment for both featured bangers and surrounding quote-post
commentary.

Set the server-only `DIGEST_MOCK_DATA=true` flag to show the fixture in another
non-production environment. Do not set it in production.

## Data boundary

- ClickHouse is the analytical source for candidates and archived quote-post
  commentary. The current `recent-bangers` ranking counts distinct non-self
  quote tweets from Community Archive members. Digest pulls include targets by
  all authors and make a second member-scoped query to freeze a
  `communityAuthored` marker on each candidate. A run keeps only the top `min(50,
num_bangers_with_score_at_least_2)` rows: every included post has a Community
  Archive banger score of at least two, and there are never more than 50.
- The existing Supabase tweet-page RPC supplies in-window conversation replies
  while the experiment is manual. Quote posts remain filtered to Community
  Archive members through ClickHouse. Both are frozen into the run before the
  model is called.
- Supabase/PostgreSQL is authoritative for editorial state:
  `digest_prompt_versions`, `digest_runs`, and `digest_editions`.
- Published content contains immutable tweet snapshots. Reading a digest does
  not re-run the analytical query, so later metric refreshes cannot rewrite an
  edition.

This preserves the project rule that ClickHouse is a rebuildable serving
projection, not a write authority.

## Lab workflow

1. Choose an immutable prompt version and pull the last 24 hours.
2. Review the saved candidate snapshot. Every qualifying banger is selected by
   default, up to 50; save any inclusion or exclusion changes.
3. Generate. The request queues a Vercel Workflow and returns immediately, so
   refreshing, closing the tab, or navigating elsewhere cannot cancel the job.
   The durable step fetches up to twelve archived Community Archive quote posts
   and eight in-window replies per selected banger with independent failure
   handling. It flattens bangers and context into one deterministic zero-indexed
   corpus, then makes exactly one Responses API call. Bangers occupy the first
   indices in rank order, so index `0` is the default representative tweet. The
   receiver validates the JSON schema and converts every returned index back to
   the frozen tweet ID before saving the completed run.
4. Review the structured output and trace. A failed provider call or validation
   result remains a failed run rather than becoming a public draft.
5. Ask for a simple revision when needed. Each request creates a linked,
   immutable run with the instruction, exact request, provider response, usage,
   and validation trace; the source run remains unchanged.
6. Edit the validated summary, story copy, and notes in a WYSIWYG Markdown
   editor; edit labels and keywords as plain text. The public digest safely
   renders bold, italic, strikethrough, inline code, and links. Saving creates a
   new private draft. Editors can also stage the validated output unchanged.
   Neither path mutates the model run or replaces an existing published
   version, and every later save creates another draft version.
7. Publish explicitly with the prominent **Publish Daily Digest** action.
   `publish_digest_edition(uuid)` archives the old version and publishes the
   selected draft in one database transaction. The nightly workflow uses the
   same function after a valid generation; if an editor has already published
   that date, automation preserves the editorial edition.

A generation attempt is immutable once it starts. The lab polls the saved run
while it is open and shows queued, context, model, and validation phases; the
job itself does not depend on that browser connection. Use **Clone as new run**
to reuse the exact frozen source snapshot with the same or a newer prompt
version. Finished-run checkboxes can also be changed directly; saving that
selection forks an editable run. Both paths preserve failed and successful
model responses for comparison.
Manual generations never auto-stage or auto-publish. The production nightly
workflow is the deliberate exception: it creates one system-owned run for the
completed date, generates with the newest immutable prompt, stages the
validated output, and publishes it. The unique automated-run index and the
one-published-edition index make duplicate cron delivery safe.

Every edition keyword must occur verbatim in supplied posts. Exact story-title
excerpts are preferred and checked, while a paraphrase becomes a non-fatal
editorial warning. Every story must reference at least one indexed banger, and
a banger cannot be assigned to multiple stories. These are executable guards
against generic AI-derived topic labels, newsletter-style headlines, and
fabricated tweet references. The loose editorial label is generated
separately.

## Observability

`digest_runs` is the primary run ledger. It stores:

- source window, candidate ranking, and saved inclusion state;
- immutable prompt version and exact rendered request;
- raw provider response and validated publication artifact;
- provider response ID and resolved model;
- the durable Vercel Workflow run ID;
- input, output, and total token counts;
- end-to-end duration and terminal error;
- an ordered event trace for candidate, selection, commentary, generation,
  and edition stages.

The lab renders those fields directly and refreshes a visible running-job panel
every three seconds. Server failures also log with the digest run ID, so Vercel
logs, Workflow run/step observability, and the durable ledger can be joined
during diagnosis.

`community_archive_monitoring_digest()` exposes only aggregate publication
freshness and automated-failure state to the least-privilege `readclient` role.
The production PostgreSQL exporter turns that into the service-catalog health
signal; prompt text, source snapshots, drafts, and error details remain private.

## Configuration

Required server-only values:

```env
OPENAI_API_KEY=<secret>
OPENAI_API_BASE_URL=https://api.openai.com/v1
DEEPSEEK_API_KEY=<secret>
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
CLICKHOUSE_ANALYTICS_API_URL=https://analytics.community-archive.org/analytics
CLICKHOUSE_ANALYTICS_API_TOKEN=<shared-gateway-token>
SUPABASE_SERVICE_ROLE=<server-only-service-role>
CRON_SECRET=<random-secret-at-least-16-characters>
DIGEST_AUTOMATION_ENABLED=true
```

Do not expose any of these with a `NEXT_PUBLIC_` prefix. Public digest reads use
the normal anonymous Supabase client and the `status = 'published'` RLS policy.

The current prompt uses `openai/gpt-5.4` through OpenRouter, high reasoning
effort, and the model's 128,000-token maximum completion ceiling. Its
one-call structured output requires exactly three summary bullets, a
representative tweet index, three to five stories with loose labels and
tweet-index lists, tweet-grounded titles, short explanatory subtitles,
source-grounded `In brief` bullets, editor notes, and exact corpus keywords.
The prompt explicitly checks tone, absurdity, source credibility, sarcasm, and
reply/quote context before reporting a claim as news; likely satire and
shitposts must be treated as jokes or memes. It prefers the top-ranked banger
as representative while allowing a more iconic choice. The lab can fork this
into a new immutable version; prior runs keep their exact prompt and provider
configuration. Summary bullets target 140 characters while the transport
schema allows up to 200. Subtitles prioritize one complete explanatory sentence
over a fixed character target, with 500 characters of transport and editing
headroom. These looser transport limits prevent a provider from satisfying the
schema by clipping prose. OpenRouter counts hidden reasoning and visible JSON
against the same completion ceiling; representative local replays exhausted a
6,000-token ceiling before producing valid JSON. DeepSeek V4 Flash also
intermittently ignored the strict schema at higher ceilings, while exact GPT-5.4
replays for August 19 and 20 produced valid editions accepted by the app's
deterministic assembler. The maximum provider-supported budget preserves high
reasoning while leaving ample room for the structured edition; generation still
stops naturally when the concise response is done.

The candidate corpus spans all authors and marks every banger with
`authored_by_community_member`. The prompt treats that marker as a strong
editorial preference: it favors coherent and relevant community-authored
stories, but keeps non-community stories when they are unusually big,
especially relevant, or needed to make a strong edition.
The frozen marker is also copied onto selected banger snapshots so public
digest tweet cards label community-authored posts as `Community author`.

## Nightly schedule and recovery

Vercel invokes `GET /api/cron/daily-digest` at `06:15 UTC` every day. That is
10:15 PM PST or 11:15 PM PDT, fifteen minutes after the existing Community
Archive day closes. Vercel cron schedules are UTC-only; the digest boundary is
therefore stable while the local Pacific clock shifts with daylight saving
time. The route requires Vercel's `CRON_SECRET` bearer header and returns as
soon as the durable workflow is queued.

The workflow is date-idempotent. It skips a date that is already published,
does not replace an edition an editor published during generation, and reuses a
completed automated run if publication is retried. Generation or validation
failure leaves the run failed and does not change the public edition.

For a supervised backfill within the last 30 completed days, send the same
bearer credential to `POST /api/cron/daily-digest` with a JSON body such as
`{"digestDate":"2026-08-19"}`. This queues the same idempotent generation and
publication workflow as the nightly schedule; it is not an editor-side publish
shortcut. Dates outside that recovery window are rejected.

To pause new nightly writes without affecting public reads, set
`DIGEST_AUTOMATION_ENABLED=false` or disable the cron in Vercel. To recover a
failed date, inspect its saved run and Workflow trace in `/admin/digest`, then
clone/revise and publish through the existing editorial path. Do not delete the
run ledger.

## Rollout gates

Before setting `DIGEST_AUTOMATION_ENABLED=true` in production:

1. Apply `20260813000650_add_daily_digest_editorial_workspace.sql` and
   the subsequent Daily Digest prompt-version migrations through
   `20260814062256_add_single_call_indexed_deepseek_digest_prompt.sql`,
   `20260814165156_add_digest_workflow_run_id.sql`, and
   `20260814180703_refine_daily_digest_editorial_workflow.sql` through
   `20260814215420_preserve_community_weighting_with_complete_subtitles.sql`
   to staging.
2. Run database security and performance advisors; verify anonymous users can
   read only published rows and cannot call `publish_digest_edition`.
3. Produce representative weekday and weekend runs, including sparse and noisy
   24-hour windows. Compare prompt versions on inclusion precision, cluster
   coherence, title specificity, and factual/tweet-ID validation.
4. Verify the public daily and story pages in a protected remote preview.
5. Apply the migration and server secrets in production before merging a
   frontend release that expects the tables.
6. Deploy the service-catalog and Grafana digest-health check, verify one manual
   production-equivalent cron request, and confirm the new run reaches
   `published` before enabling the recurring write path.
7. Add the weekly email/Substack adapter as a separate delivery boundary. A
   delivery failure must not mutate or unpublish the daily edition.

## Rollback

- Stop DeepSeek generation by removing `DEEPSEEK_API_KEY` (and OpenAI
  experiments by removing `OPENAI_API_KEY`); public editions remain readable.
- Archive a bad edition and republish a previously staged version through the
  service-role publication function.
- Roll back the frontend independently of the tables. The migration is additive
  and does not change tweet, membership, consent, or ingestion objects.

Do not drop digest tables as an ordinary rollback after editors have created
prompt/run history. Preserve the ledger and remove only the consuming UI.
