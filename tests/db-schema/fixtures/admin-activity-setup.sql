-- Minimal dependencies for admin-activity-feed.sql; use only in a fresh disposable database.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
CREATE SCHEMA private;
CREATE TYPE upload_phase_enum AS ENUM ('completed','uploading');
CREATE TABLE public.archive_upload(id bigint PRIMARY KEY,created_at timestamptz,account_id text,username text,upload_phase upload_phase_enum);
CREATE TABLE public.optin(id uuid PRIMARY KEY,created_at timestamptz,updated_at timestamptz,opted_in_at timestamptz,opted_out_at timestamptz,twitter_user_id text,username text,opted_in boolean,explicit_optout boolean,opt_out_reason text);
CREATE TABLE private.admin_jobs(key uuid PRIMARY KEY,status text,created_at timestamptz,updated_at timestamptz,args jsonb,job_name text);
CREATE TABLE public.user_action_log(id bigint PRIMARY KEY,account_id text,action_type text,created_at timestamptz,metadata jsonb);
CREATE TABLE public.all_account(account_id text PRIMARY KEY,username text);
