# How to use PostHog for the Community Archive

_29 October 2026, 18:11 PDT_

PostHog for the CA answers one question well: **do signed-in members actually use a feature, and do they come back?** It does not measure traffic, SEO, or anonymous readers, because collection is gated to signed-in sessions (PR #1144, 25 Oct 2026) and every event is sanitized to bounded enums. For traffic and bots use Vercel analytics and logs instead.

The canonical reference is [docs/product-analytics.md](../docs/product-analytics.md). This memo is the practical layer on top of it.

## 1. What the data can and cannot say

| Question | PostHog answer | Where |
| --- | --- | --- |
| How many members did something useful this week? | Yes: *engaged people* (distinct, once across actions) | Product Pulse v2, weekly engaged tile |
| Which features reach people? | Yes: *feature use* per week, ranked | Feature adoption headline + features table |
| Do people come back? | Yes, but small samples: new vs returning, 2+ days active, 90-day cohort returns | New/returning + cohort tiles |
| Does search convert? | Partly: `archive_search_submitted` → `phase=canonical` results → `tweet_card_action open` with `origin=search` | Saved insights, not on the main dashboard yet |
| What did user X search for / which tweet? | No. Query text, tweet IDs, names are never sent | — |
| How much traffic does the site get? | No. Signed-out visits emit nothing | Vercel |
| Did the homepage map get used? | Yes: `homepage_map_action` by `action` and `tab` | Two linked map insights, 28 days |

Identity: signed-in members are identified with public username, email, and display name as person properties. That lets you open a person page and watch a member's event timeline, which is the fastest way to debug "it did not work for me" reports.

## 2. The weekly 15-minute loop

Keep the dashboard's audience selector on **Community only** (excludes `exgenesis` and `christineist`). Then:

1. **Freshness first.** Open the [Collection freshness insight](https://us.posthog.com/project/546185/insights/8bvEB5Jp) or run the SQL in the docs. If the newest product action is older than a day, the quiet week is a collection problem, not a product one. Check [billing](https://us.posthog.com/organization/billing): analytics, replay, and errors have separate allowances, and exceptions arriving does not prove actions arrive.
2. **Adoption.** Features table: which feature reached the most people, which one is flat. Rows overlap, so never sum them.
3. **Return.** Returning engaged people and 2+ days active. Use counts next to rates; a cohort of 12 people makes percentages meaningless.
4. **One journey.** Pick one funnel (default: search), look at drop-off, then watch 3 to 5 recordings of people who dropped. Use 28 days when the week is too thin.
5. **Decide one change** and write down the metric you expect to move. Recheck it after release with the same audience and window.

## 3. Traps that produce wrong conclusions

- **Two audience boundaries.** Around 21 Oct the free analytics allowance ran out (gap). On 25 Oct collection became signed-in-only (step change). Never compare across either line; verify the deploy time before picking windows.
- **Zeros are not zeros.** A new event has no history. An empty cell before its release is "unmeasured", not "nobody did it".
- **Do not add uniques.** Engaged people is one distinct count. Adding per-event or per-feature uniques double counts anyone who did two things.
- **Pageviews are not use.** `$pageview` and `product_page_viewed` are different families and neither is a meaningful action. Bot filters only affect query results; they do not stop ingestion or recover quota.
- **Upload completed means accepted**, not processed or searchable.
- **Replay has a $0 limit**, so once the free recordings run out there are no new recordings until the cycle resets. Analytics has a $5/month limit; included free usage still applies.

## 4. Things worth adding that cost nothing

- **Annotations** on the dashboard for each release that touches instrumentation or the audience (free, and the single best defence against trap 1).
- **A weekly subscription** of Product Pulse v2 to email or Slack (free tier allows 5). It turns the 15-minute loop into a Monday habit.
- **Alerts** (5 free) on the freshness insight: "no `archive_search_submitted` in 24h" catches the next quota outage the same day instead of a week later.
- **Cohorts** built from person properties and events, e.g. members who completed an upload, members who used Bangers twice. Compare their return rate against everyone else; this is the cheapest "does feature X retain people" test available.
- **Funnels for the other journeys** already instrumented: digest story opened → tweet opened; directory profile opened → tweet opened; app `details_opened` → `launch_clicked`.
- **Error tracking** is on and nearly free (728 of 100k). Link an `$exception` to the recording of the session it happened in.

## 5. Adding a new event (the short version)

1. Register the page in `src/lib/analyticsRoutes.ts`.
2. Exploration controls: `captureProductAction(feature, action)` with values from `productActionSchema.ts`.
3. A new named outcome: add validators in `allowedEventProperties` in `src/lib/posthog.ts`, capture with `capturePostHogEvent`. Only enums, booleans, bounded counts. Never text, IDs, URLs, or names.
4. Capture in the user's handler, after success for outcomes; never per keystroke, drag frame, or render.
5. Run the focused analytics tests listed in the docs plus `pnpm type-check`.
6. After release, verify one real signed-in journey arrives in PostHog with the right identity and properties. Do not fabricate events to fill charts.

## 6. Letting Claude query it directly

`.mcp.json` now has a `posthog-ca` entry pinned to project 546185. It needs a personal API key exported as `POSTHOG_CA_API_KEY` in the agent's environment; see the PostHog MCP section of [docs/local-setup.md](../docs/local-setup.md). The claude.ai PostHog connector belongs to another org and cannot see this project.
