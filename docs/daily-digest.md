# Daily Digest

The Daily Digest turns a frozen rolling 24-hour snapshot of recent bangers into
three to five readable stories. Public pages are fixed publication artifacts;
the private lab keeps the exact inputs, prompt version, model response, usage,
and stage-by-stage trace needed to reproduce and compare generations.

## Product surfaces

- `/digest` shows the latest published edition.
- `/digest/YYYY-MM-DD` is the permanent daily-edition URL.
- `/digest/YYYY-MM-DD/story-slug` is a linkable story page with bangers and
  selected archived quote-post commentary.
- `/admin/digest` is restricted by the existing production admin identity gate.
  It creates snapshots, edits inclusion, forks prompts, generates output,
  stages versions, and publishes one version per day.

The global navigation and homepage digest card expose only published editions.
Drafts, raw responses, prompts, and failures never cross the public RLS policy.

### Preview fixture

Vercel preview deployments and local development include a clearly labeled
August 11, 2026 mock edition at `/digest/2026-08-11`. It is assembled from the
August 11 banger-cluster research memo and uses hydrated tweet snapshots, but it
never writes to `digest_editions` and is disabled in production. The edition
view includes a calendar-style day selector; only dates with a real or preview
edition are clickable.

Set the server-only `DIGEST_MOCK_DATA=true` flag to show the fixture in another
non-production environment. Do not set it in production.

## Data boundary

- ClickHouse is the analytical source for candidates and archived quote-post
  commentary. The current `recent-bangers` ranking counts distinct non-self
  quote tweets from Community Archive members against targets authored in the
  selected time window.
- Supabase/PostgreSQL is authoritative for editorial state:
  `digest_prompt_versions`, `digest_runs`, and `digest_editions`.
- Published content contains immutable tweet snapshots. Reading a digest does
  not re-run the analytical query, so later metric refreshes cannot rewrite an
  edition.

This preserves the project rule that ClickHouse is a rebuildable serving
projection, not a write authority.

## Lab workflow

1. Choose an immutable prompt version and pull the last 24 hours.
2. Review the saved candidate snapshot. The top 18 are selected by default;
   save any inclusion or exclusion changes.
3. Generate. The action fetches up to four archived quote posts per selected
   banger with independent failure handling, renders the exact prompt, calls
   the OpenAI Responses API with a strict JSON schema, and validates every
   returned tweet ID and keyword.
4. Review the structured output and trace. A failed provider call or validation
   result remains a failed run rather than becoming a public draft.
5. Stage a new edition version. Staging never replaces an existing published
   version.
6. Publish explicitly. `publish_digest_edition(uuid)` archives the old version
   and publishes the selected draft in one database transaction.

A generation attempt is immutable once it starts. Use **Clone as new run** to
reuse the exact frozen source snapshot with the same or a newer prompt version;
this preserves failed and successful model responses for comparison.

Every story keyword must occur verbatim in a supplied banger or commentary
post. This is an executable guard against generic AI-derived topic labels.

## Observability

`digest_runs` is the primary run ledger. It stores:

- source window, candidate ranking, and saved inclusion state;
- immutable prompt version and exact rendered request;
- raw provider response and validated publication artifact;
- provider response ID and resolved model;
- input, output, and total token counts;
- end-to-end duration and terminal error;
- an ordered event trace for candidate, selection, commentary, generation,
  and edition stages.

The lab renders those fields directly. Server failures also log with the digest
run ID, so Vercel logs and the durable ledger can be joined during diagnosis.

## Configuration

Required server-only values:

```env
OPENAI_API_KEY=<secret>
OPENAI_API_BASE_URL=https://api.openai.com/v1
CLICKHOUSE_ANALYTICS_API_URL=https://analytics.community-archive.org/analytics
CLICKHOUSE_ANALYTICS_API_TOKEN=<shared-gateway-token>
SUPABASE_SERVICE_ROLE=<server-only-service-role>
```

Do not expose any of these with a `NEXT_PUBLIC_` prefix. Public digest reads use
the normal anonymous Supabase client and the `status = 'published'` RLS policy.

The initial prompt uses `gpt-5.6-terra`, low reasoning effort, and a 5,000-token
output ceiling. The lab can fork this into a new immutable version. It does not
modify a prompt referenced by prior runs.

## Rollout gates

Automation is deliberately disabled during the editorial experiment. Before a
daily timer or weekly Substack send is enabled:

1. Apply `20260813000650_add_daily_digest_editorial_workspace.sql` to staging.
2. Run database security and performance advisors; verify anonymous users can
   read only published rows and cannot call `publish_digest_edition`.
3. Produce representative weekday and weekend runs, including sparse and noisy
   24-hour windows. Compare prompt versions on inclusion precision, cluster
   coherence, title specificity, and factual/tweet-ID validation.
4. Verify the public daily and story pages in a protected remote preview.
5. Apply the migration and server secrets in production before merging a
   frontend release that expects the tables.
6. Treat the scheduler as a new monitored timer: document it in the service
   catalog, add success/failure/freshness signals and alerts, verify one manual
   production run, and keep publishing manual until quality evidence supports
   auto-publish.
7. Add the weekly email/Substack adapter as a separate delivery boundary. A
   delivery failure must not mutate or unpublish the daily edition.

## Rollback

- Stop generation by removing `OPENAI_API_KEY`; public editions remain readable.
- Archive a bad edition and republish a previously staged version through the
  service-role publication function.
- Roll back the frontend independently of the tables. The migration is additive
  and does not change tweet, membership, consent, or ingestion objects.

Do not drop digest tables as an ordinary rollback after editors have created
prompt/run history. Preserve the ledger and remove only the consuming UI.
