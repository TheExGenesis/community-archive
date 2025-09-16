-- Idempotent cleanup: guard objects before DROP/REVOKE to avoid errors in preview envs
DO $$
BEGIN
  -- Drop RLS policy only if table exists; IF EXISTS requires table to exist
  IF to_regclass('public.conversations') IS NOT NULL THEN
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "Public read access" ON public.conversations';
    EXCEPTION WHEN OTHERS THEN
      -- Ignore if policy/table is missing or managed elsewhere
      NULL;
    END;
  END IF;

  -- Revoke grants only if role and table exist
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readclient') THEN
    IF to_regclass('public.likes') IS NOT NULL THEN
      BEGIN
        EXECUTE 'REVOKE SELECT ON TABLE public.likes FROM readclient';
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    IF to_regclass('public.mentioned_users') IS NOT NULL THEN
      BEGIN
        EXECUTE 'REVOKE SELECT ON TABLE public.mentioned_users FROM readclient';
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;
END$$;

