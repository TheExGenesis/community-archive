# Profile chapter sections

Sections are generated offline. Existing successful generated years and all
hand-curated years stay frozen, preserving published titles, tweet assignments,
and `?chapter=YEAR&section=SLUG` links. Curated years override generated years
individually; generation can fill other years of a curated account.

## Backfill

1. Follow the current public export pointer at
   <https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/community-archive-public-export/latest.json>.
   Download its manifest and `publication.urls.tweets` outside the repository.
   The export is consent-safe; superseded downloads expire.
2. Install Python's `duckdb` package in a local environment and extract candidates:

   ```sh
   python scripts/profile-section-pool.py \
     --parquet /private/path/tweets.parquet \
     --manifest /private/path/manifest.json \
     --output /private/path/section-pool.json
   ```

   The extractor verifies the manifest checksum, selects already-sectioned
   accounts, enumerates active UTC years, and selects up to 50 original tweets
   per account/year by likes, with tweet ID as the tie-breaker. Replies, retweets,
   link-only posts, and bare media labels are excluded. Years with no usable originals remain in
   the pool as empty arrays, so they are still audited.

3. Run the generator with its existing gateway, public Supabase, and OpenRouter
   configuration in `.env`:

   ```sh
   pnpm script scripts/generate-profile-sections.ts \
     --backfill-existing --tweet-pool /private/path/section-pool.json \
     --audit /private/path/audit.json --digest /private/path/digest.md
   ```

   The generator checks current public-directory eligibility, independently of
   the export snapshot. It never fetches a production Supabase tweet corpus.
   The deployed gateway currently lacks an account/year top-liked query; the
   verified export supplies that offline pool without a gateway deployment.

Every empty or missing year is considered. Six or more bangers trigger the
original generation path first. If it does not yield two valid sections, the
broader pool is tried with three posts per section, then with two if needed.
Every accepted title must occur in one of its assigned posts. Duplicate tweet
assignments, unknown IDs, invalid titles and colliding slugs are rejected.
No thematic split is forced when the posts do not support one.

Provider errors are retried within a run. Empty years remain retryable on later
runs; provider-only failures are not persisted as accepted empty results.
Successful results are written serially and atomically even when model requests
run concurrently. `--only Prigoose` narrows the selection; `--years 2025` narrows the audited years. `--force` remains an
explicit regeneration option for the original workflow, and is rejected with
`--backfill-existing`.

The audit records before/after status, candidate counts, successful responses,
provider failures and unfilled reasons. A data/provider failure makes the
command exit nonzero. The raw candidate pool remains outside the repository.

## Theme labels (draft)

A section's quoted title describes the one tweet it came from, not the whole
section. A section can now also carry a `label`: 1-4 plain words naming what
every tweet in it shares, such as "speech coaching". The label is the heading
in the navigation and the workspace. The title stays the verbatim quote from
the tweet that leads the section, shown under the heading in muted italic
curly quotes, and it still derives the slug. The catch-all keeps the title
`other` and has no label.

The prompt asks for `{"sections": [{"label", "title", "tweet_ids"}]}`. The
label must describe every post in its section. A post goes in a section only
when a reader would agree it is about the label; otherwise it is left for
`other`. The title is taken from the post that best represents the label.
`parseYearSections` drops a section with no usable label, just as it drops
one with an invalid title. A label is rejected when it:

- is not a string, or is empty after trimming quotes and trailing periods;
- has more than 4 words or 32 characters;
- has a link or `@handle`;
- is made only of vague words (`thoughts`, `life`, `misc`, `random`,
  `musings`, `reflections`, `updates`, `observations`, `other`, filler words
  and so on), so "random thoughts" fails and "thoughts on soup" passes;
- copies a label from the prompt's example (`sinkholes`, `soup`);
- repeats an earlier label in the same year.

None of the generated years has labels yet, and the curated sections have
none unless someone adds them by hand. A section without a label uses its
quote as the heading and shows no second line, which is the old behavior.

### Regeneration plan

Rerun the generator for the years to be labeled, one account or year at a
time:

```sh
pnpm script scripts/generate-profile-sections.ts \
  --force --only Prigoose --years 2025 --digest /private/path/digest.md
```

`--force` with `--years` now regenerates only the years named; the account's
other years stay in the file. Curated years stay frozen even with `--force`.
Slugs derive from the title, so if the model labels the same grouping and
picks the same quote, `?section=` links keep working. A new grouping or a new
quote changes the slugs. Old links then fall back to the year view: an unknown
slug resolves to no active section in `ProfileArchive` and the chapter is shown
whole. A forced year that comes back with no defensible split is written empty,
which removes its sections. Review the diff and restore those years from git
before committing.

Cost: the 2026-09-08 backfill audited 569 years. At about $0.0007 per
DeepSeek call, a full pass with retries comes to well under $1.

## Rendering

The generated configuration stores supplemental IDs for representatives that
were outside the banger pool. The year feed hydrates those IDs through the
existing full-fidelity ClickHouse tweet loader, checks author/year, deduplicates
against current bangers, sorts and paginates the combined result. Media and
quoted posts use the existing adapter and renderer. Gateway errors yield an
unavailable feed instead of a successful empty section.

All-time browsing keeps its existing feed. Navigation also includes configured
years that have no bangers. Normal years retain their existing paginated path;
only years with supplemental representatives require the combined collection.
Generation-source metadata is server-only and is never included in section UI
props. Year headings use semibold in both navigation layouts.

## Verification

```sh
python scripts/test_profile_section_pool.py
pnpm exec jest --selectProjects server client --runInBand --runTestsByPath \
  src/lib/metaTwitter/sectionGeneration.test.ts \
  src/lib/metaTwitter/sectionConfig.test.ts \
  src/lib/metaTwitter/chapterSections.test.ts \
  src/lib/profileCuration.test.ts \
  src/components/metaTwitter/ProfileArchive.test.tsx
pnpm type-check
pnpm lint
pnpm build
```

The extraction test checks UTC year boundaries, ranking, exclusions, the cap,
and checksum rejection. Generation tests cover primary-first behavior, retries,
three-before-two fallback, title/ID validation and genuinely thin pools.
Rendering tests cover zero-banger navigation, hydration, pagination,
deduplication, author/year checks and visible gateway failures. Inspect sample
groups against their source text before committing a backfill, and compare all
previous successful years structurally to confirm they remain frozen.

## Backfill result — 2026-09-08

Relative to PR #878 at `4c3551c436579610e2001d503032c1af7328ab2b`:

| Measure                                         | Count |
| ----------------------------------------------- | ----: |
| Already-sectioned accounts audited              |    52 |
| Active years audited                            |   569 |
| Previously filled years, preserved unchanged    |   207 |
| Previously recorded empty years, now all filled |    21 |
| Previously missing years discovered             |   341 |
| Additional years filled using bangers           |    12 |
| Additional years filled using top-liked posts   |   293 |
| Filled years after backfill                     |   512 |
| Remaining: fewer than four usable posts         |    47 |
| Remaining: no defensible split                  |    10 |
| Unresolved provider/data failures               |     0 |

The three accounts with only empty generated entries were outside the requested
already-sectioned scope. Their four empty entries remain untouched.

The input was export `2026-09-08T07-00-55Z`, verified against its SHA-256 manifest.
The complete per-year results are in [profile-sections-audit.json](profile-sections-audit.json).
Counts consolidate the UTC-corrected run and review corrections; source fields
in individual records describe the accepted generation path.

Representative inspection included Prigoose 2025 (four groups: living near
friends, parenting, Twitter Speedrun, and FractalU), tasshinfogleman 2022
(recovered through bangers), TylerAlterman 2025 (also recovered through bangers),
and older fallback years with sparse or media-heavy posts. Review rejected two
overfragmented results, removed an uninformative bare-photo group, and replaced
a vague “Amazing” grouping with specific supported groups. These edits affected
only new, unpublished years.

Verification on the branch after integrating current main: focused profile
suite (38 tests), extraction fixture, type-check, lint, and production build.
All 207 previously successful generated year records were structurally unchanged.
All 3,874 new representative assignments were checked against the export for
account and UTC year; fallback IDs and title grounding were also checked against
their candidate pool. Existing curated definitions were moved without changing
their contents. Lint retains an unrelated existing `<img>` warning.
