# Birdseye and Strands display data

Birdseye (`/birdseye`) and Strands (`/strands`, `/strands/<seed-id>`) are native
Next.js pages linked from Community Apps. They render existing analyses; they
do not start inference jobs, regenerate clusters, or depend on Modal at request
time. Strands list and detail content is rendered on the server, with ordinary
crawlable pagination and canonical detail URLs.

## Storage and serving

The private Supabase Storage bucket `community-app-data` contains a small
`manifest.json` pointer and immutable `v1/<import-id>/` display packages. The
server uses its existing service-role client to read these objects. Never make
this bucket public or add anonymous Storage policies. No signed object URLs
are sent to browsers. `COMMUNITY_APP_DATA_DIR` can select the same package on a
server filesystem or in local development.

The snapshot content cache lasts five minutes; policy is checked independently
on every request. Current PostgreSQL `user_directory` membership is required
for each analysis subject/strand seed author. Explicit `optin` withdrawals take
precedence, including account-ID checks for a renamed subject. Birdseye topics
and Strands that identify a withdrawn participant in their saved metadata are
withheld. Policy or storage errors fail closed through the route error boundary.
These are saved AI analyses, not a live view of a person's opinions. Their
participant lists come from the original analysis metadata and supporting tweet
index; they are not a newly reconstructed conversation corpus.

## Birdseye privacy and presentation

Birdseye is private by default; the public account catalog has been removed.
Verified administrators can use the profile picker to inspect all currently
eligible analyses. This grants read access, not permission to share on behalf
of another owner. Membership and opt-outs still apply to administrator reads.
The page and `/api/birdseye/sources` verify the current Supabase Auth user,
trusted Twitter identity, account ID against `user_directory`, and current
membership/opt-out policy before loading analysis content. Source requests
select only IDs from the authorized topic, six at a time, and use the same
full-fidelity tweet loader and opt-out filtering as Strands.

Owners can explicitly enable one share link for all their topics, replace it,
or revoke it. The server stores only a SHA-256 token hash and bound Twitter
identity in the owner's admin-controlled `app_metadata.birdseye_share`.
No database migration or public Storage policy is needed. Share requests read
fresh Auth metadata, so rotation and revocation invalidate previously issued
cookies on the next request. Revocation cannot recall already downloaded copies.

`/api/birdseye/share/<auth-user-id>.<256-bit-secret>` validates the link and
redirects immediately to the clean Birdseye URL with an HttpOnly, SameSite=Lax
cookie (one day; HTTPS cookies are Secure). The link remains usable until
revoked or replaced. It is a bearer credential: do not log it or paste it into
analytics. The redirect renders no page scripts; private responses use
`no-store`, `no-referrer`, and `noindex`. The analysis/share UI is blocked from
PostHog autocapture and session replay via `ph-no-capture`.

Birdseye opens on a macro-topic overview, ordered by each group's unique cited
post count. Subtopics are ranked by cited count too. Profile switching lives at
`/birdseye/profiles`, behind the same admin gate; it is a compact header link on
the profile itself. The large sidebar headings use sans-serif type, with subtle
scrollbars revealed on hover or keyboard focus.

The compact profile header pairs the avatar and display name with a muted handle.
Topic pages show an expandable two-line saved summary followed by three sample
TweetCards in one desktop row (a swipeable row on mobile). Exact-ID PostgreSQL metadata
lookups rank only that topic's cited references by likes, prioritizing the
profile owner's posts. The final payloads use the configured shared archive
reader and fresh opt-out checks; conversation-context samples are labeled.
Ranking metadata is cached for five minutes. There is no whole-archive scan,
new analysis, or inference. A ranking failure displays an unavailable notice;
it does not silently substitute arbitrary samples.

Monthly bars derive UTC creation months from the saved tweet snowflakes,
deduplicate references, fill interior empty months, and crop to the first/last
cited month. Existing yearly summaries follow horizontally, cropped to the
same year range. Hover, focus, or tap a month to see its count. These counts include cited conversation context and do not
claim full archive activity. Compact insight panels follow, starting with entities. Each uses a three-column
label grid; descriptions and source icons appear on hover or click, with keyboard
and touch access. Known participant handles use available directory avatars.
Popover portals carry the same analytics exclusion markers as the private page.
The remaining six-at-a-time source feed excludes the three samples, labels owner
posts versus conversation context, and groups related replies using exact-reference
parent/conversation metadata. Each thread is ordered by tweet ID and stays together
as subsequent pages load; no uncited parents or other thread content are fetched.
Missing metadata leaves a post separate, and lookup failures are retryable errors. Existing saved analysis content
and relationships are unchanged.

The standard `dev` and `dev-remote-db` scripts bind to `127.0.0.1` and enable
`LOCAL_ADMIN_PREVIEW=true`. On a loopback host in `NODE_ENV=development`, with
no Vercel deployment marker, this starts a local admin read preview automatically.
The header's Local admin menu signs out (persistent across reloads) and can
restart the preview. It does not create a Supabase user, fabricate an OAuth
identity, grant production admin write permissions, or change sharing settings.
Other development launchers must both bind to loopback and explicitly set the
flag. Production/preview deployments and non-loopback hosts cannot use it.

Set `COMMUNITY_APP_DATA_DIR` to an existing normalized display package to avoid
Storage downloads while testing locally. Live membership/opt-out checks and
source tweet reads still use the configured serving backends. Real Twitter OAuth
remains available; mock login stays disabled against production Supabase.

## Display package

- `birdseye/<username>.json`: existing topic names, summaries, ontology items,
  yearly summaries, topic groups, and exact string tweet references. The original
  low-quality-topic flags remain hidden by default. The year
  counts describe cited posts, not the full archive's tweet activity. Internal
  ontology links become text; source references use current CA tweet routes.
- `strands.json`: the existing Best Strands titles, summaries, seed text, ratings,
  and annotated key-post references. The original snapshot date is retained.
- `manifest.json`: schema version, immutable prefix, import time, source Strands
  snapshot date, and the catalog of completed Birdseye analyses.

No original archive JSON, private messages, embeddings, model responses,
Python pickles, or raw conversation trees are included. Incomplete analyses
are reported and excluded rather than triggering generation.

## Reproduce an import

Use a Python environment with pandas, pyarrow, and the authenticated Modal SDK:

```bash
python scripts/community-apps/export_display_data.py \
  --modal \
  --strands /path/to/memetic-lineage/bangers/public/strands_data.json \
  --output /private/path/community-app-display-data
```

For local source data, replace `--modal` with `--local-root /path/to/birdseye/data`.
`--resume` resumes an interrupted local export. Four bounded workers read only
the four display inputs named in the exporter. Each account's input is capped
at 10 MB. No raw inputs are written to disk; normalized files are atomically
replaced. Keep the output outside the public product repository.

After reviewing the package, upload to the authorized destination:

```bash
node scripts/community-apps/upload_display_data.mjs \
  /private/path/community-app-display-data /path/to/credential-source.env
```

The uploader reads credentials at runtime, requires a private bucket, uploads
all versioned objects, switches the private manifest last, and verifies the
pointer. A failed version upload leaves the previous pointer untouched. Do not
publish the same package under an unrelated public bucket or commit it to Git.
Changing the display package does not deploy website code. The website branch
must be reviewed and deployed separately. To roll back a package, restore a
previous private manifest; to roll back the viewer, revert the website commit.

## Focused checks

```bash
python -m unittest discover -s scripts/community-apps -p 'test_*.py'
pnpm exec jest --selectProjects server --runInBand --runTestsByPath src/lib/community-apps/data.test.ts
```

Verify owner access, denied anonymous access, topic navigation, and lazy sources
in Birdseye. Test share/replace/revoke with a mock account in local or staging
Supabase, never by changing a production account for verification. Check search
and a Strands detail page in a local browser. Verify anonymous direct Storage access
is denied after a private import. Do not regenerate analyses during verification.

### Strands presentation

Strands uses the original semantic projection (`strand-positions.json`, only
seed IDs and 2D display coordinates, imported from the original
`bangers/public/strand_semantic_map.json`). Deterministic farthest-first k-means
forms ten spatial clusters. Each cluster shares the hue of its centroid's angle
around the collection centroid. Clustering happens before request filtering;
only policy-eligible strands reach the minimap. Search, cluster selection and
pagination preserve stable colors. The map supports zoom and source navigation.

List cards pair the seed tweet with the first summary paragraph. Detail pages
place the seed above a chronological key-post map, with dated avatar labels,
keyboard/click selection, zoom, and a full timeline toggle. Marker lanes separate
same-day labels; vertical position does not claim influence or quote volume.
The story follows the map. Dates use the source timestamp, or the exact tweet
snowflake when a source is unavailable.

Visible seed and key posts use the shared `TweetCard`, preserving complete text,
media and quoted tweets. Reads are limited to 24 seeds per list page or one
strand's key IDs (currently at most 10). When ClickHouse reads are enabled, use
its existing tweet detail endpoint with four requests at a time; an absent
record stays unavailable, while other failures propagate without switching
sources. Other environments use bounded Supabase ID lookups and existing portal
media/quote enrichment. Apply current username and account-ID opt-outs to both
returned authors and quoted authors after enrichment. Missing posts show a
source link, not a fabricated tweet. No snapshot or database writes are needed
for this presentation change.
