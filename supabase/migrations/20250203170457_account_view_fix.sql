CREATE OR REPLACE VIEW public.account AS
SELECT
  a.account_id,
  a.created_via,
  a.username,
  a.created_at,
  a.account_display_name,
  a.num_tweets,
  a.num_following,
  a.num_followers,
  a.num_likes,
  a.updated_at
FROM
  all_account a
  JOIN archive_upload au ON a.account_id = au.account_id
  AND au.id = (
    (
      SELECT
        MAX(archive_upload.id) AS MAX
      FROM
        archive_upload
      WHERE
        archive_upload.account_id = a.account_id
        AND archive_upload.upload_phase = 'completed'
    )
  );