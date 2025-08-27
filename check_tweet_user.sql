\d private.tweet_user;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'private' 
  AND table_name = 'tweet_user';
SELECT * FROM private.tweet_user LIMIT 3;
EOF < /dev/null