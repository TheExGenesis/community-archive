# Product analytics

PostHog has two layers: automatic pageviews/clicks for broad coverage, and named
product events for actions and outcomes. Browser measurement respects DNT and
cannot count clients that block or never execute analytics.

## Dashboard

[Product Pulse v2](https://us.posthog.com/project/546185/dashboard/2080935)
uses production pageviews, deduplicated engagement, feature reach, meaningful
actions, retention, search conversion, and experience health. The
[original dashboard](https://us.posthog.com/project/546185/dashboard/2016936)
remains available for detailed comparisons.

Metric definitions:

- Visitors: distinct people with a product `$pageview` in the period. Exclude
  admin/auth/utility routes and bots; bots are a heuristic, not a guarantee.
- Engagement: visitors who also performed a qualifying action in that same
  period, counting a person once across all action types. Never add independent
  per-event unique counts. A page or navbar click alone is not engagement.
- Feature engagement: the same intersection by feature. Use `feature` on new
  events and normalized page URLs on older events; do not expose dynamic IDs.
- Search results: `phase=canonical` is the complete result; previews are separate.
  Count failures separately from a successful empty result.
- `archive_upload_completed` means browser upload accepted, not background
  processing complete or searchable. No worker-completion claim is made here.
- Ready durations: exclude `navigation_shell` for usable-data timing. A missing
  `elapsed_ms` means the navigation start was unknown, not zero milliseconds.

Current weeks are partial. Expanded page coverage and new action instrumentation
change the baseline. Mark missing instrumentation as unavailable; do not invent
historical zeroes. Signed-in and Community Archive member are different states.

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
  src/components/birdseye/TopicSummary.analytics.test.tsx
pnpm type-check
```

The contract check enumerates actual Next page files and literal event calls,
then validates representative outcome payloads through the real sanitizer.
Navigation tests cover Strict Mode and revisits; the Birdseye interaction test
covers a user action through the same sanitizer without private content.

After release, inspect one short journey each for a direct page load, internal
navigation, graph/strand selection, Birdseye expansion, and search. Confirm one
intended event, allowed properties, correct identity, and arrival in PostHog.
Do not run broad historical scans or inject fabricated production events to
populate empty charts. Roll back the frontend commit independently from the new
dashboard; the original dashboard remains available.
