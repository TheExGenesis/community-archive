-- Preserve Bulletin's user-directory membership semantics without loading
-- profiles/counts. Separate anti-joins allow indexed/hash checks instead of
-- repeatedly comparing every archived member to every opt-in.
CREATE OR REPLACE VIEW bulletin.allowed_accounts AS
WITH archived AS MATERIALIZED (
  SELECT a.account_id,a.username
  FROM public.all_account a
  JOIN (SELECT DISTINCT account_id FROM public.archive_upload
        WHERE upload_phase='completed') uploads USING(account_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.optin o
    WHERE o.explicit_optout IS TRUE AND o.twitter_user_id=a.account_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.optin o
    WHERE o.explicit_optout IS TRUE AND lower(o.username)=lower(a.username)
  )
), members AS (
  SELECT account_id FROM archived
  UNION
  SELECT a.account_id
  FROM public.optin o JOIN public.all_account a ON a.account_id=o.twitter_user_id
  WHERE o.opted_in IS TRUE AND o.explicit_optout IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.optin blocked
      WHERE blocked.explicit_optout IS TRUE AND blocked.twitter_user_id=o.twitter_user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.optin blocked
      WHERE blocked.explicit_optout IS TRUE AND lower(blocked.username)=lower(o.username)
    )
    AND NOT EXISTS (SELECT 1 FROM archived WHERE archived.account_id=o.twitter_user_id)
    AND NOT EXISTS (SELECT 1 FROM archived WHERE lower(archived.username)=lower(o.username))
)
SELECT a.account_id,a.username
FROM members JOIN public.all_account a USING(account_id)
WHERE NOT a.is_tombstone
  AND NOT EXISTS (
    SELECT 1 FROM public.optin o
    WHERE o.explicit_optout IS TRUE AND o.twitter_user_id=a.account_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.optin o
    WHERE o.explicit_optout IS TRUE AND lower(ltrim(o.username,'@'))=lower(a.username)
  )
  AND NOT EXISTS (
    SELECT 1 FROM tes.blocked_scraping_users b WHERE b.account_id=a.account_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM tes.blocked_scraping_users b
    WHERE lower(ltrim(b.username,'@'))=lower(a.username)
  );
