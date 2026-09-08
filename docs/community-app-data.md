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

Birdseye is owner-only by default; the public account catalog has been removed.
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

Each topic row has a sparkline with a shared year range and individually scaled
counts of cited posts. The topic page shows compact insight cards, icon source
links, and lazy source tweet cards, with a Load more/retry fallback. The profile
handle is the primary heading. Local development against production Supabase
uses real Twitter OAuth; mock login remains disabled for that project. Its OAuth
redirect allowlist still needs to permit the local callback for local sign-in.

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
only policy-eligible strands reach the minimap. Search and pagination preserve
stable colors. Cluster buttons highlight in place without navigation or filtering
the cards; All clears the highlight. The map supports zoom and source navigation.

List cards pair the seed tweet with the first summary paragraph. Detail pages
place the seed above a chronological key-post map, with dated avatar labels,
keyboard/click selection, zoom, and a full timeline toggle. Marker lanes separate
same-month cards, which share a single monthly dot in both views; vertical position does not claim influence or quote volume.
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

The minimap also retains all 22 nonempty handwritten labels from the original
`strand_semantic_map.json`; those dots keep a dark ring, including when a label
is hidden to avoid overlap. Zoom reveals more labels. Hover/focus previews the
original seed text, and hovering or focusing a list card highlights its dot while
graying out every other dot and label. Leaving the card restores the cluster
highlight. Any hovered/focused dot shows its strand title (or handwritten label)
and cluster above it. Selecting a cluster without handwritten labels adds up to
two representative strand labels, prioritizing them over other labels. The sidebar
is 480px wide on desktop; the conversation map fits its container at default zoom
and hides its horizontal scrollbar when zoomed.
The ten natural-language cluster names in `strand-cluster-names.ts` use the
owner-selected wording, without changing membership.

`strand-display.json` stores those labels and the original monthly histogram
counts and `total_tweets` from `bangers/public/strand_histograms.json` (January 2015–December 2025).
Only policy-eligible strands receive display metadata. Cards plot the saved
monthly counts with per-month hover text; these are historical aggregates, not
fresh activity counts or just the selected key tweets. Cards show the original
total post count. The landing page’s “How does it work?” disclosure explains seed
selection, structural and semantic connections, and the limits of this method.

Key posts offer an on-demand thread preview at
`/api/strands/<seed>/context?tweet_id=<key-post>`. The endpoint first verifies
that the seed is still eligible and the selected ID belongs to that strand.
It uses the existing ClickHouse thread read, or the existing permalink RPC
when ClickHouse reads are disabled; it does not recover missing tweets or write
data. Current opt-outs break traversal before selecting at most five ancestors
and five chronological descendants. Nearby continuations take precedence over
much later direct replies. The bounded selection is hydrated with the same
full-fidelity tweet cards and final opt-out checks as other Strands posts.
Unavailable context has a retry state and a full-conversation link. Timeline
labels show the post date, with a seed marker where applicable.
