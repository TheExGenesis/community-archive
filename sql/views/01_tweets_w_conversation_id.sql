CREATE OR REPLACE VIEW public.tweets_w_conversation_id AS
SELECT tweets.*, c.conversation_id
FROM tweets LEFT JOIN conversations c ON tweets.tweet_id = c.tweet_id;