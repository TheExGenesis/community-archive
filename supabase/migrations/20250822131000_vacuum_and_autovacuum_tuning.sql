-- Optimize autovacuum settings for tables with high update rates
-- This prevents dead tuple accumulation that's causing performance issues

-- Tables with 10-18% dead tuples need more aggressive autovacuum
ALTER TABLE public.followers SET (
    autovacuum_vacuum_scale_factor = 0.05,  -- Vacuum when dead tuples reach 5% (default is 20%)
    autovacuum_analyze_scale_factor = 0.05   -- Analyze when 5% changed
);

ALTER TABLE public.following SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE public.user_mentions SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE public.all_profile SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE public.mentioned_users SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE public.tweet_urls SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE public.all_account SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.05
);

-- For high-traffic tables with lots of updates
ALTER TABLE public.tweets SET (
    autovacuum_vacuum_scale_factor = 0.10,  -- 10% threshold
    autovacuum_analyze_scale_factor = 0.05,
    fillfactor = 90  -- Leave 10% free space for HOT updates
);

ALTER TABLE public.temporary_data SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02,  -- Analyze more frequently
    autovacuum_vacuum_cost_delay = 2  -- Be more aggressive
);

ALTER TABLE storage.objects SET (
    autovacuum_vacuum_scale_factor = 0.10,
    autovacuum_analyze_scale_factor = 0.05
);

-- Note: Actual VACUUM commands should be run manually after deployment
-- VACUUM (VERBOSE, ANALYZE) public.followers;
-- VACUUM (VERBOSE, ANALYZE) public.following;
-- VACUUM (VERBOSE, ANALYZE) public.all_profile;
-- VACUUM (VERBOSE, ANALYZE) public.mentioned_users;
-- VACUUM (VERBOSE, ANALYZE) public.tweet_urls;
-- VACUUM (VERBOSE, ANALYZE) public.user_mentions;

DO $$ 
BEGIN 
    RAISE NOTICE 'Autovacuum settings optimized for high-update tables';
    RAISE NOTICE 'Run manual VACUUM on tables with high dead tuple ratios after deployment';
END 
$$;