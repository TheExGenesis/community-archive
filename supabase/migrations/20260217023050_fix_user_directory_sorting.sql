create or replace view "public"."user_directory" as  SELECT a.account_id,
    a.username,
    a.account_display_name,
    a.created_at,
    a.num_tweets,
    a.num_followers,
    a.num_following,
    a.num_likes,
    p.bio,
    p.website,
    p.location,
    p.avatar_media_url,
    au.archive_at,
    au.created_at AS archive_uploaded_at
   FROM ((account a
     LEFT JOIN profile p ON ((a.account_id = p.account_id)))
     JOIN archive_upload au ON (((a.account_id = au.account_id) AND (au.id = ( SELECT max(au2.id) AS max
           FROM archive_upload au2
          WHERE ((au2.account_id = a.account_id) AND (au2.upload_phase = 'completed'::upload_phase_enum)))))));

GRANT SELECT ON TABLE "public"."user_directory" TO "readclient";
