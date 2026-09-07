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

Verify an account/topic change and source link in Birdseye, and search plus a
Strands detail page in a local browser. Verify anonymous direct Storage access
is denied after a private import. Do not regenerate analyses during verification.
