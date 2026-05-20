-- Allow admins to create explicit opt-out rows for accounts that have not
-- authenticated with Supabase. Existing user-owned rows continue to use user_id.
ALTER TABLE "public"."optin"
  ALTER COLUMN "user_id" DROP NOT NULL;
