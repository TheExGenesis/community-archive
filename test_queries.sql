-- Test if we have any data in private.tweet_user
SELECT COUNT(*) as total_records,
       MIN(inserted) as earliest,
       MAX(inserted) as latest
FROM private.tweet_user;

-- Test the compute function directly
SELECT * FROM ca_website.compute_hourly_scraping_stats(
    now() - interval '24 hours',
    now()
) LIMIT 5;

-- Test the get function
SELECT * FROM ca_website.get_hourly_scraping_stats(24) LIMIT 5;

-- Check if scraping_stats table has any data
SELECT COUNT(*) FROM ca_website.scraping_stats;
