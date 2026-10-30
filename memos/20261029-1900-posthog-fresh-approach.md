# PostHog for the CA: a fresh approach

_29 October 2026, 19:00 PDT_

Today PostHog is used as a feature-adoption counter for signed-in members. It is paid for and configured as if that were the whole job. The proposal below treats it as the single place the CA's reliability and usage questions get answered: errors from browser and server, replays that explain those errors, performance per page, and alerts that fire before a member complains. Feature use stays, but stops being the headline.

Ordering is by payoff per hour. Phase 1 is a day of work and closes the biggest blind spot. Phases 2 and 3 are mostly PostHog settings. Phase 4 is optional and each item is a decision of its own.

## Where we actually are

| Capability | State today | Gap |
| --- | --- | --- |
| Browser exceptions | On (`capture_exceptions: true`), but dropped by the signed-in gate for everyone else | Public readers, the majority of traffic, produce no error signal |
| Server errors (78 API routes, server actions, digest cron, email cron) | `console.error` only, read in Vercel logs | No grouping, no trend, no alert, no link to the person or session |
| Stack traces | No source maps uploaded | Minified frames; triage means guessing |
| React error boundary | `error.tsx` logs to console, no `global-error.tsx` | Crashes reach neither PostHog nor a root-layout fallback |
| Session replay | Records every signed-in session, fully masked | Burns the 5,000 free recordings on uneventful sessions; spending limit is $0, so the month ends blind |
| Web Vitals, network timing, `website_section_ready` | On | Not surfaced on any dashboard; no regression alert |
| Alerts and subscriptions | None (5 of each are free) | Quota outage on 21 Oct was found a week late |
| Digest LLM calls (`src/lib/digest/openai.ts`) | Untracked | Cost, latency, filtered or failed generations invisible |
| Flags, experiments, surveys, heatmaps | Disabled in the SDK config | Fine for now; see phase 4 |
| Non-Vercel services (autorefresh, canonical consumer, ClickHouse) | Not in PostHog | Separate journals and cron logs |

## Phase 1: errors become a product (about one day)

1. **Server-side capture.** Add `posthog-node` and a Next.js `instrumentation.ts` with `onRequestError`, which Next 15 calls for every unhandled error in route handlers, server components, and server actions. One hook covers all 78 routes without touching them. Attach only route name, method, status, and the signed-in user id when present. Flush before the function returns; Vercel functions are short-lived.
2. **Deliberate server reports.** A small `reportServerError(scope, error, context)` helper for the places that already `console.error` and continue, starting with upload processing, digest generation, and the two cron routes. Bounded context only: enum scope, counts, status codes. Never archive content, query text, or emails.
3. **Source maps.** Add `@posthog/nextjs-config` (`withPostHogConfig`) so the Vercel build injects and uploads source maps, with `POSTHOG_CLI_TOKEN` and the project id as build env vars. Keep `productionBrowserSourceMaps` off for the public; the upload uses the build output.
4. **React boundaries.** `error.tsx` and a new `global-error.tsx` call `posthog.captureException` and show the fallback. The global boundary is the only thing that catches a root-layout crash.
5. **Anonymous browser exceptions (decision needed).** Letting the gate pass `$exception` events for signed-out sessions, with no person profile and no identification, closes the largest gap. Cost: the SDK then loads for every visitor, and the data policy page would need one sentence. Exceptions have their own 100k free allowance, separate from analytics, so this does not threaten the analytics budget. Recommendation: do it, with `person_profiles: 'identified_only'` unchanged and replay still signed-in only.
6. **Triage ritual.** Error tracking issues get the same weekly 15 minutes as the product dashboard: sort by people affected, assign or resolve, and mark noisy ones as ignored. Two free alert destinations: one for new issues, one for a spike on an existing issue, both to Discord or Slack.

## Phase 2: replay that explains instead of records (settings only)

Replay is most useful attached to a problem. Switch from record-everything to trigger-based recording in the project's replay settings; these are remote config, so the existing `/flags` request picks them up without a deploy:

- **Event triggers:** `$exception`, `$rageclick`, `archive_upload_failed`, `search_results_failed`, `profile_curation_failed`.
- **URL trigger:** the upload flow and the sign-in callback, where most support questions come from.
- **Sampling:** 10 to 20 percent of remaining signed-in sessions for the adoption review.
- **Minimum duration:** 5 seconds, to skip bounces.

This keeps the free allowance for recordings someone will watch. If the $0 replay limit stays, this is the only way the month does not end blind. The masking config stays as it is.

## Phase 3: alerts and a reliability dashboard (an afternoon)

A second dashboard, Reliability, next to Product Pulse v2:

- Exceptions per day, browser vs server, with the top five issues.
- Failed outcome events per day: upload, search, profile curation, stream load more.
- Web Vitals p75 per page category (LCP, INP, CLS) and `website_section_ready` p75 for usable data, excluding `navigation_shell`.
- API route error rate and p95 from the server-side events.

Five free alerts, in this order: no product action for 24 hours (freshness, catches quota outages the same day); new error issue affecting more than 3 people; `archive_upload_failed` above a daily threshold; LCP p75 on the homepage above 2.5 seconds; digest cron error. A weekly subscription sends both dashboards to the team channel.

## Phase 4: optional, each its own decision

- **LLM analytics for the digest.** Wrap the fetch in `src/lib/digest/openai.ts` with PostHog's AI capture (100k free events). Gives cost, latency, model fallbacks, and filtered-content retries per edition. Low effort, but prompts and completions would leave the CA; use privacy mode so only metadata is sent.
- **Other services.** The autorefresh and canonical consumer processes can report exceptions through `posthog-python` into the same project, which puts every CA error in one list. Needs a service-role style API key in that repo's environment.
- **Data warehouse link.** PostHog can sync Postgres tables (1M free rows a month). Syncing only public or aggregate tables, such as account join dates and upload status, would answer "do uploaders come back" without new events. Privacy review first; the member table is small.
- **Feature flags.** Currently disabled in the SDK. Re-enable only when a staged rollout is actually planned, for example the next homepage change; flags cost nothing until then.
- **Surveys.** Disabled. A one-question "did you find what you were looking for" after an empty search is the only candidate worth the interruption.

## What not to change

- The signed-in gate for product analytics and replay stays. It is why analytics stays inside the $5 limit and why bots do not pollute adoption numbers.
- The sanitizer and property validators stay the contract for every new event, including error context.
- Do not sample product actions to save quota; sample replay instead.

## Budget after this plan

Analytics: unchanged. Exceptions: well within 100k free. Replay: inside 5,000 free with triggers, so the $0 limit can stay. Source map uploads, alerts, subscriptions, dashboards: free. Only LLM analytics and warehouse syncs add usage, both inside free allowances at the CA's scale.
