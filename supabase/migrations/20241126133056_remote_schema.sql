DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'auth' 
                   AND table_name = 'mfa_challenges'
                   AND column_name = 'web_authn_session_data') THEN
        ALTER TABLE "auth"."mfa_challenges" ADD COLUMN "web_authn_session_data" jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'auth' 
                   AND table_name = 'mfa_factors'
                   AND column_name = 'web_authn_aaguid') THEN
        ALTER TABLE "auth"."mfa_factors" ADD COLUMN "web_authn_aaguid" uuid;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'auth' 
                   AND table_name = 'mfa_factors'
                   AND column_name = 'web_authn_credential') THEN
        ALTER TABLE "auth"."mfa_factors" ADD COLUMN "web_authn_credential" jsonb;
    END IF;
END $$;