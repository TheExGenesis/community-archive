# PostHog portal action instrumentation

_12 August 2026, 09:30 PDT_

## Outcome

The signed-in Community Archive portal now emits semantic PostHog events for
its main product interactions. These complement pageviews, autocapture, replay,
errors, and Web Vitals; they do not replace them.

The event catalog is intentionally compact so PostHog insights can break down a
few stable event families by an `action`, `destination`, or `origin` property.

## Event catalog

| Event                          | Covers                                                                                          | Main breakdowns                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `archive_search_submitted`     | Homepage and advanced archive searches                                                          | `surface`, `has_query`, `active_filter_count`           |
| `dashboard_destination_opened` | Dashboard panel links, research, tools, Best Strands, and the Parquet export                    | `destination`, `surface`, `external`                    |
| `tweet_card_action`            | Opening, expanding, collapsing, opening quoted tweets, and opening archived quotes              | `action`, `origin`, media/quote/featured booleans       |
| `bangers_action`               | Search, time/author filters, clear, load more, and retry                                        | `action`, `time_range`, `sort`, `scope`, `result_count` |
| `trends_explorer_action`       | Add/reactivate/remove terms, chart and evidence filters, year ranges, scale, refresh, and retry | `action`, series counts, `has_year_filter`              |
| `portal_stream_loaded_more`    | Reaching and successfully loading another live-stream page                                      | `loaded_tweet_count`, `has_more`                        |

The stream now marks tweet links with `origin=stream`, so the tweet detail page
can return readers to the live stream and PostHog can distinguish stream opens.

## Data boundary

Custom event properties use bounded enums, booleans, and aggregate counts. The
new event fields do not include search phrases, trend terms, tweet text, tweet
IDs, or outbound URLs. PostHog's existing SDK context, pageview, autocapture,
and replay configuration remain unchanged.

Signed-in users continue to be identified through the existing PostHog auth
bridge, so these member actions can be associated with the existing public
username, email, and display-name person properties.

## Suggested PostHog insights

Once production has collected events, the highest-value product panels are:

1. Weekly unique members by event family.
2. Dashboard destinations, broken down by `destination`.
3. Tweet engagement, broken down by `action` and `origin`.
4. Bangers usage, broken down by `action`, with `scope`, `sort`, and
   `time_range` filters.
5. Trends usage, broken down by `action`.
6. Search submissions by `surface`.

## Verification

- `pnpm type-check`: passed.
- `pnpm lint`: passed with one pre-existing `<img>` warning in
  `src/components/UnifiedTweetList.test.tsx`.
- Focused client tests: 2 suites, 10 tests passed.
- Focused server/jsdom tests: 4 suites, 44 tests passed.
