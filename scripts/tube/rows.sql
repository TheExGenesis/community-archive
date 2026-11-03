set statement_timeout='280s';
with u as (
  select distinct on (tweet_id, vid) tweet_id, vid from (
    select tweet_id, substring(expanded_url from '(?:[?&]v=|youtu\.be/|/shorts/|/embed/|/live/|/v/)([A-Za-z0-9_-]{11})') as vid
    from public.tweet_urls where expanded_url ilike '%youtu%'
  ) x where vid is not null
)
select u.vid v, u.tweet_id t, tw.account_id a, extract(epoch from tw.created_at)::bigint c, tw.favorite_count f, tw.reply_to_tweet_id is not null r
from u join public.tweets tw on tw.tweet_id = u.tweet_id;
