CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "tweet_id" text NOT NULL PRIMARY KEY,
    "conversation_id" text,
    FOREIGN KEY (tweet_id) REFERENCES public.tweets(tweet_id)
);

CREATE INDEX idx_conversation_id ON public.conversations(conversation_id);