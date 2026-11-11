// POST is ambiguous for RPCs. Only these audited reads become GET requests;
// publication, view increments, consent, uploads and other mutations stay local.
const READ_RPCS = new Set([
  'resolve_directory_identity',
  'policy_account_is_blocked',
  'policy_json_contains_blocked_author',
  'get_tweet_page_data',
  'get_bulletin_board_state',
  'get_bulletin_runs',
  'get_bulletin_prompts',
  'get_bulletin_refreshes',
  'admin_activity_page',
  'admin_list_blocked_scraping_users',
  'get_simple_streamed_tweet_counts',
  'get_unique_scraper_count',
  'get_tweet_counts_by_granularity',
  'get_tweet_count_by_date',
  'get_scraper_counts_by_granularity',
  'get_account_most_mentioned_accounts',
  'get_top_mentioned_users',
  'search_user_suggestions',
  'search_tweets',
  'search_tweets_exact_phrase',
  'ca_tweet_like_summary',
])

export const isReadRpc = (name: string) => READ_RPCS.has(name)
