# Product analytics

PostHog has two layers: automatic pageviews/clicks for broad coverage, and named
product events for actions and outcomes. Browser measurement respects DNT and
cannot count clients that block or never execute analytics.

## Dashboard

[Product Pulse v2](https://us.posthog.com/project/546185/dashboard/2080935)
leads with meaningful activity: weekly engaged people, weekly action volume,
weekly feature and action tables, and return activity. The
[original dashboard](https://us.posthog.com/project/546185/dashboard/2016936)
remains available for traffic comparisons. Page visits are not verified humans
and do not count as meaningful use.

The activity charts cover four complete Monday–Sunday UTC weeks plus the current
partial week. Weekly tables use relative columns so they keep rolling forward.
Retention retains its existing 30-day observation window and incomplete-follow-up
handling. Production host and PostHog bot filters apply; team activity is included.
Bot filtering and meaningful-action requirements are not proof of humanity.

Metric definitions:

- Engaged people: distinct people performing a qualifying action in the week,
  counted once across action types. No pageview prerequisite or pageview-based
  denominator. Never add per-event unique counts to calculate this metric.
- Action volume: number of qualifying events in the week; repeated actions count.
- Feature use: distinct people performing qualifying actions in each feature and
  week. Attribute by event family, explicit product-event `feature`, or tweet
  `origin`, rather than incidental page location. A search from the homepage
  counts as Search; tweet actions with an unknown origin are labeled explicitly.
  A person can use multiple features, so feature rows are not additive.
- Actions table: distinct people per action and week; repeated uses of the same
  action count once per person. This measures adoption, not raw event volume.
- Qualifying actions: archive search; tweet expand/open/archived-quotes/external/
  quoted-tweet opens; Bangers search/load-more; Trends terms-added/evidence-refresh;
  Digest story/keyword-search opens; directory profile opens; upload acceptance;
  deliberate `product_action` events; app launch clicks; and confirmed profile
  curation saves. App details, edit starts, failed saves, navigation, pageviews,
  background result delivery, and tweet collapse do not qualify.
- Retention: weekly return activity from the first meaningful activity observed
  in the 30-day window, not a claim about lifetime-new users. Incomplete follow-up
  cells remain unavailable.

Search conversion and experience health are saved separately but removed from
the main dashboard until their missing events arrive after the tracking release.
Zeroes from absent instrumentation must not be presented as observed drop-off or
zero failures. New feature instrumentation also has no recoverable historical
baseline; the weekly tables describe recorded actions only.

Outcome definitions for release verification:

- Search results: `phase=canonical` is the complete result; previews are separate.
  Count failures separately from a successful empty result.
- `archive_upload_completed` means browser upload accepted, not background
  processing complete or searchable. No worker-completion claim is made here.
- Ready durations: exclude `navigation_shell` for usable-data timing. A missing
  `elapsed_ms` means the navigation start was unknown, not zero milliseconds.

Signed-in and Community Archive member are different states. Expanded action
instrumentation changes the baseline; do not invent historical zeroes.

## Apps and profile curation

- `community_app_action`: `details_opened` from gallery cards, or `launch_clicked`
  from the gallery dialog, homepage featured apps, and `/tools`. Properties are
  the public catalog `app_slug`, fixed `source`, and launch `external` flag.
  Newly approved gallery apps are covered automatically. Slugs are bounded public
  identifiers, not URLs, creators, descriptions, or search text. A launch measures
  intent to open an app, not successful load or usage inside an external app.
  Normal clicks, keyboard activation, and middle-clicks on launch links are covered;
  browser context-menu actions cannot reliably be observed.
- `profile_edit_started`: entering profile edit mode. Done editing is not a save.
- `profile_curation_saved`: emitted only after the server confirms add, dismiss,
  restore-item, feature toggle, reorder, or section restore. Includes `section`
  (`bangers`/`people`), `source` (`profile`/`tweet_card`), and the resulting
  `is_featured` for toggles. The separate Add to profile tweet button is covered.
- `profile_curation_failed`: rejected saves with the same action/section/source.
  No item IDs, account IDs, submitted text, or raw errors are collected.

The weekly features table groups launches under Apps and saved edits under Profile
editing. The actions table distinguishes apps by slug and profile changes by type
and section. Tables keep This week leftmost, followed by Last week and older weeks.
These events start after frontend release; absent historical rows are unmeasured.

## Adding pages and actions

1. Register every page template in `src/lib/analyticsRoutes.ts` with a stable name
   and group. `product` pages emit `product_page_viewed`; information, utility,
   admin, and auth pages emit `site_page_viewed`. Unrecognized paths emit an
   `unknown` category without the original URL. Exact routes precede dynamic
   templates, so `/birdseye/profiles` stays an admin route.
2. Use `captureProductAction(feature, action)` for exploration controls. Its
   values and runtime validators share `productActionSchema.ts`. Never pass
   names, topic labels, query text, tweet IDs, archive contents, or private data.
3. For another named outcome, add its validators to `allowedEventProperties` in
   `src/lib/posthog.ts` and capture it through `capturePostHogEvent`. Event names
   are checked by TypeScript. Invalid properties are rejected; development warns
   without printing the unsafe payload.
4. Shared links can use `PostHogLink`. Capture intent in the user handler, not
   renders or hover effects. Capture success after completion; failures use safe
   category codes. Do not emit on every keystroke, drag frame, or scroll tick.

The sanitizer adds `route_name`, `page_group`, `feature`, and
`analytics_version=2`. URL query/hash values are stripped and dynamic paths
normalized. SDK click text/attributes and replay inputs/text are masked;
`.ph-no-capture` blocks private replay regions. Automatic and custom pageviews
are separate event families and must not be summed as page-view counts.

## Focused verification

```sh
pnpm exec jest --selectProjects server client --runInBand --runTestsByPath \
  src/lib/analyticsContract.test.ts src/lib/posthog.test.ts \
  src/lib/posthogProvider.test.tsx src/components/PostHogPageView.test.tsx \
  src/components/birdseye/TopicSummary.analytics.test.tsx \
  src/components/PostHogLink.test.tsx \
  src/components/community/CommunityGallery.test.tsx \
  src/components/metaTwitter/ProfileArchive.test.tsx \
  src/components/portal/AddToProfileButton.test.tsx
pnpm type-check
```

The contract check enumerates actual Next page files and literal event calls,
then validates representative outcome payloads through the real sanitizer.
Navigation tests cover Strict Mode and revisits; the Birdseye interaction test
covers a user action through the same sanitizer without private content.

After release, inspect one short journey each for a direct page load, internal
navigation, graph/strand selection, Birdseye expansion, search, app launch, and
profile save/failure. Confirm one
intended event, allowed properties, correct identity, and arrival in PostHog.
Do not run broad historical scans or inject fabricated production events to
populate empty charts. Roll back the frontend commit independently from the new
dashboard; the original dashboard remains available.
