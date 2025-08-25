# Pending Review Migrations

These migrations are present locally but not in the remote database. They need to be reviewed before applying to avoid potential conflicts or data issues.

## Status: NEEDS REVIEW
**Do not apply these migrations without careful review and testing.**

## Migrations in this folder:
- `20250307130643_stats.sql` - Stats-related changes
- `20250307144041_views.sql` - Database views changes  
- `20250317220509_rls.sql` - Row Level Security changes
- `20250317225419_circle_quarantine.sql` - Circle quarantine functionality
- `20250417150124_revert_circle_quarantine.sql` - **CONFLICTING** - Policy already exists error
- `20250523064434_update_delete_user.sql` - Update delete user functionality
- `20250604153500_enhance_search_tweets_with_offset_and_media.sql` - Search enhancements
- `20250707140145_firehosev2.sql` - Firehose v2 functionality

## Next Steps:
1. Review each migration file to understand what changes they make
2. Check if these changes conflict with current remote database state
3. Test migrations in a safe environment before applying to production
4. Consider if these features are still needed or if they should be discarded

## Context:
These migrations were found when trying to push `20250806165135_update_get_tweet_count_by_date_granularity.sql` for the stream-monitor chart fixes. Supabase detected that local migrations exist that come before the last migration on the remote database.