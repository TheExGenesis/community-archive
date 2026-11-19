// POST is ambiguous for RPCs. Only these audited reads become GET requests;
// publication, view increments, consent, uploads and other mutations stay local.
const READ_RPCS = new Set([
  'resolve_directory_identity',
  'policy_account_is_blocked',
  'policy_json_contains_blocked_author',
  'get_bulletin_board_state',
  'get_bulletin_runs',
  'get_bulletin_prompts',
  'get_bulletin_refreshes',
  'admin_activity_page',
  'admin_list_blocked_scraping_users',
  'get_unique_scraper_count',
  'get_top_mentioned_users',
  'search_user_suggestions',
  'ca_tweet_like_summary',
])

export const isReadRpc = (name: string) => READ_RPCS.has(name)
