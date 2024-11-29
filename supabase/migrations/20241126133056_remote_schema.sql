alter table "auth"."mfa_challenges" add column "web_authn_session_data" jsonb;
alter table "auth"."mfa_factors" add column "web_authn_aaguid" uuid;
alter table "auth"."mfa_factors" add column "web_authn_credential" jsonb;
