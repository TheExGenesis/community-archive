drop function if exists "private"."tes_complete_group_insertions"(process_cutoff_time timestamp without time zone);

drop function if exists "private"."tes_import_temporary_data_into_tables"();

drop function if exists "private"."tes_invoke_edge_function_move_data_to_storage"();

drop function if exists "private"."tes_process_account_records"(process_cutoff_time timestamp without time zone);

drop function if exists "private"."tes_process_media_records"(process_cutoff_time timestamp without time zone);

drop function if exists "private"."tes_process_mention_records"(process_cutoff_time timestamp without time zone);

drop function if exists "private"."tes_process_profile_records"(process_cutoff_time timestamp without time zone);

drop function if exists "private"."tes_process_tweet_records"(process_cutoff_time timestamp without time zone);

drop function if exists "private"."tes_process_unique_mention_record"(process_cutoff_time timestamp without time zone, target_originator_id text);

drop function if exists "private"."tes_process_unique_tweet_record"(process_cutoff_time timestamp without time zone, target_originator_id text);

drop function if exists "private"."tes_process_url_records"(process_cutoff_time timestamp without time zone);


alter table "public"."optin" add column "explicit_optout" boolean default false;

alter table "public"."optin" add column "opt_out_reason" text;

CREATE INDEX idx_optin_explicit_optout ON public.optin USING btree (explicit_optout) WHERE (explicit_optout = true);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_optin_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    
    -- Track opt-in/opt-out timestamps
    IF OLD.opted_in = false AND NEW.opted_in = true THEN
        NEW.opted_in_at = NOW();
        NEW.opted_out_at = NULL;
        NEW.explicit_optout = false; -- Clear explicit opt-out when opting in
        NEW.opt_out_reason = NULL;
    ELSIF OLD.opted_in = true AND NEW.opted_in = false THEN
        NEW.opted_out_at = NOW();
    END IF;
    
    -- Handle explicit opt-out
    IF OLD.explicit_optout = false AND NEW.explicit_optout = true THEN
        NEW.opted_in = false;
        NEW.opted_out_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$function$
;

grant select on table "public"."all_account" to "readclient";

grant select on table "public"."all_profile" to "readclient";

grant select on table "public"."archive_upload" to "readclient";

grant select on table "public"."conversations" to "readclient";

grant select on table "public"."followers" to "readclient";

grant select on table "public"."following" to "readclient";

grant select on table "public"."liked_tweets" to "readclient";

grant select on table "public"."optin" to "readclient";

grant select on table "public"."scraper_count" to "readclient";

grant select on table "public"."tweet_media" to "readclient";

grant select on table "public"."tweet_urls" to "readclient";

grant select on table "public"."tweets" to "readclient";

grant select on table "public"."user_mentions" to "readclient";


revoke delete on table "temp"."account_1360327512031711237" from "anon";

revoke insert on table "temp"."account_1360327512031711237" from "anon";

revoke references on table "temp"."account_1360327512031711237" from "anon";

revoke select on table "temp"."account_1360327512031711237" from "anon";

revoke trigger on table "temp"."account_1360327512031711237" from "anon";

revoke truncate on table "temp"."account_1360327512031711237" from "anon";

revoke update on table "temp"."account_1360327512031711237" from "anon";

revoke delete on table "temp"."account_1360327512031711237" from "authenticated";

revoke insert on table "temp"."account_1360327512031711237" from "authenticated";

revoke references on table "temp"."account_1360327512031711237" from "authenticated";

revoke select on table "temp"."account_1360327512031711237" from "authenticated";

revoke trigger on table "temp"."account_1360327512031711237" from "authenticated";

revoke truncate on table "temp"."account_1360327512031711237" from "authenticated";

revoke update on table "temp"."account_1360327512031711237" from "authenticated";

revoke delete on table "temp"."account_1360327512031711237" from "service_role";

revoke insert on table "temp"."account_1360327512031711237" from "service_role";

revoke references on table "temp"."account_1360327512031711237" from "service_role";

revoke select on table "temp"."account_1360327512031711237" from "service_role";

revoke trigger on table "temp"."account_1360327512031711237" from "service_role";

revoke truncate on table "temp"."account_1360327512031711237" from "service_role";

revoke update on table "temp"."account_1360327512031711237" from "service_role";

revoke delete on table "temp"."account_19068614" from "anon";

revoke insert on table "temp"."account_19068614" from "anon";

revoke references on table "temp"."account_19068614" from "anon";

revoke select on table "temp"."account_19068614" from "anon";

revoke trigger on table "temp"."account_19068614" from "anon";

revoke truncate on table "temp"."account_19068614" from "anon";

revoke update on table "temp"."account_19068614" from "anon";

revoke delete on table "temp"."account_19068614" from "authenticated";

revoke insert on table "temp"."account_19068614" from "authenticated";

revoke references on table "temp"."account_19068614" from "authenticated";

revoke select on table "temp"."account_19068614" from "authenticated";

revoke trigger on table "temp"."account_19068614" from "authenticated";

revoke truncate on table "temp"."account_19068614" from "authenticated";

revoke update on table "temp"."account_19068614" from "authenticated";

revoke delete on table "temp"."account_19068614" from "service_role";

revoke insert on table "temp"."account_19068614" from "service_role";

revoke references on table "temp"."account_19068614" from "service_role";

revoke select on table "temp"."account_19068614" from "service_role";

revoke trigger on table "temp"."account_19068614" from "service_role";

revoke truncate on table "temp"."account_19068614" from "service_role";

revoke update on table "temp"."account_19068614" from "service_role";

revoke delete on table "temp"."account_2963358137" from "anon";

revoke insert on table "temp"."account_2963358137" from "anon";

revoke references on table "temp"."account_2963358137" from "anon";

revoke select on table "temp"."account_2963358137" from "anon";

revoke trigger on table "temp"."account_2963358137" from "anon";

revoke truncate on table "temp"."account_2963358137" from "anon";

revoke update on table "temp"."account_2963358137" from "anon";

revoke delete on table "temp"."account_2963358137" from "authenticated";

revoke insert on table "temp"."account_2963358137" from "authenticated";

revoke references on table "temp"."account_2963358137" from "authenticated";

revoke select on table "temp"."account_2963358137" from "authenticated";

revoke trigger on table "temp"."account_2963358137" from "authenticated";

revoke truncate on table "temp"."account_2963358137" from "authenticated";

revoke update on table "temp"."account_2963358137" from "authenticated";

revoke delete on table "temp"."account_2963358137" from "service_role";

revoke insert on table "temp"."account_2963358137" from "service_role";

revoke references on table "temp"."account_2963358137" from "service_role";

revoke select on table "temp"."account_2963358137" from "service_role";

revoke trigger on table "temp"."account_2963358137" from "service_role";

revoke truncate on table "temp"."account_2963358137" from "service_role";

revoke update on table "temp"."account_2963358137" from "service_role";

revoke delete on table "temp"."archive_upload_1360327512031711237" from "anon";

revoke insert on table "temp"."archive_upload_1360327512031711237" from "anon";

revoke references on table "temp"."archive_upload_1360327512031711237" from "anon";

revoke select on table "temp"."archive_upload_1360327512031711237" from "anon";

revoke trigger on table "temp"."archive_upload_1360327512031711237" from "anon";

revoke truncate on table "temp"."archive_upload_1360327512031711237" from "anon";

revoke update on table "temp"."archive_upload_1360327512031711237" from "anon";

revoke delete on table "temp"."archive_upload_1360327512031711237" from "authenticated";

revoke insert on table "temp"."archive_upload_1360327512031711237" from "authenticated";

revoke references on table "temp"."archive_upload_1360327512031711237" from "authenticated";

revoke select on table "temp"."archive_upload_1360327512031711237" from "authenticated";

revoke trigger on table "temp"."archive_upload_1360327512031711237" from "authenticated";

revoke truncate on table "temp"."archive_upload_1360327512031711237" from "authenticated";

revoke update on table "temp"."archive_upload_1360327512031711237" from "authenticated";

revoke delete on table "temp"."archive_upload_1360327512031711237" from "service_role";

revoke insert on table "temp"."archive_upload_1360327512031711237" from "service_role";

revoke references on table "temp"."archive_upload_1360327512031711237" from "service_role";

revoke select on table "temp"."archive_upload_1360327512031711237" from "service_role";

revoke trigger on table "temp"."archive_upload_1360327512031711237" from "service_role";

revoke truncate on table "temp"."archive_upload_1360327512031711237" from "service_role";

revoke update on table "temp"."archive_upload_1360327512031711237" from "service_role";

revoke delete on table "temp"."archive_upload_19068614" from "anon";

revoke insert on table "temp"."archive_upload_19068614" from "anon";

revoke references on table "temp"."archive_upload_19068614" from "anon";

revoke select on table "temp"."archive_upload_19068614" from "anon";

revoke trigger on table "temp"."archive_upload_19068614" from "anon";

revoke truncate on table "temp"."archive_upload_19068614" from "anon";

revoke update on table "temp"."archive_upload_19068614" from "anon";

revoke delete on table "temp"."archive_upload_19068614" from "authenticated";

revoke insert on table "temp"."archive_upload_19068614" from "authenticated";

revoke references on table "temp"."archive_upload_19068614" from "authenticated";

revoke select on table "temp"."archive_upload_19068614" from "authenticated";

revoke trigger on table "temp"."archive_upload_19068614" from "authenticated";

revoke truncate on table "temp"."archive_upload_19068614" from "authenticated";

revoke update on table "temp"."archive_upload_19068614" from "authenticated";

revoke delete on table "temp"."archive_upload_19068614" from "service_role";

revoke insert on table "temp"."archive_upload_19068614" from "service_role";

revoke references on table "temp"."archive_upload_19068614" from "service_role";

revoke select on table "temp"."archive_upload_19068614" from "service_role";

revoke trigger on table "temp"."archive_upload_19068614" from "service_role";

revoke truncate on table "temp"."archive_upload_19068614" from "service_role";

revoke update on table "temp"."archive_upload_19068614" from "service_role";

revoke delete on table "temp"."archive_upload_2963358137" from "anon";

revoke insert on table "temp"."archive_upload_2963358137" from "anon";

revoke references on table "temp"."archive_upload_2963358137" from "anon";

revoke select on table "temp"."archive_upload_2963358137" from "anon";

revoke trigger on table "temp"."archive_upload_2963358137" from "anon";

revoke truncate on table "temp"."archive_upload_2963358137" from "anon";

revoke update on table "temp"."archive_upload_2963358137" from "anon";

revoke delete on table "temp"."archive_upload_2963358137" from "authenticated";

revoke insert on table "temp"."archive_upload_2963358137" from "authenticated";

revoke references on table "temp"."archive_upload_2963358137" from "authenticated";

revoke select on table "temp"."archive_upload_2963358137" from "authenticated";

revoke trigger on table "temp"."archive_upload_2963358137" from "authenticated";

revoke truncate on table "temp"."archive_upload_2963358137" from "authenticated";

revoke update on table "temp"."archive_upload_2963358137" from "authenticated";

revoke delete on table "temp"."archive_upload_2963358137" from "service_role";

revoke insert on table "temp"."archive_upload_2963358137" from "service_role";

revoke references on table "temp"."archive_upload_2963358137" from "service_role";

revoke select on table "temp"."archive_upload_2963358137" from "service_role";

revoke trigger on table "temp"."archive_upload_2963358137" from "service_role";

revoke truncate on table "temp"."archive_upload_2963358137" from "service_role";

revoke update on table "temp"."archive_upload_2963358137" from "service_role";

revoke delete on table "temp"."followers_1360327512031711237" from "anon";

revoke insert on table "temp"."followers_1360327512031711237" from "anon";

revoke references on table "temp"."followers_1360327512031711237" from "anon";

revoke select on table "temp"."followers_1360327512031711237" from "anon";

revoke trigger on table "temp"."followers_1360327512031711237" from "anon";

revoke truncate on table "temp"."followers_1360327512031711237" from "anon";

revoke update on table "temp"."followers_1360327512031711237" from "anon";

revoke delete on table "temp"."followers_1360327512031711237" from "authenticated";

revoke insert on table "temp"."followers_1360327512031711237" from "authenticated";

revoke references on table "temp"."followers_1360327512031711237" from "authenticated";

revoke select on table "temp"."followers_1360327512031711237" from "authenticated";

revoke trigger on table "temp"."followers_1360327512031711237" from "authenticated";

revoke truncate on table "temp"."followers_1360327512031711237" from "authenticated";

revoke update on table "temp"."followers_1360327512031711237" from "authenticated";

revoke delete on table "temp"."followers_1360327512031711237" from "service_role";

revoke insert on table "temp"."followers_1360327512031711237" from "service_role";

revoke references on table "temp"."followers_1360327512031711237" from "service_role";

revoke select on table "temp"."followers_1360327512031711237" from "service_role";

revoke trigger on table "temp"."followers_1360327512031711237" from "service_role";

revoke truncate on table "temp"."followers_1360327512031711237" from "service_role";

revoke update on table "temp"."followers_1360327512031711237" from "service_role";

revoke delete on table "temp"."followers_19068614" from "anon";

revoke insert on table "temp"."followers_19068614" from "anon";

revoke references on table "temp"."followers_19068614" from "anon";

revoke select on table "temp"."followers_19068614" from "anon";

revoke trigger on table "temp"."followers_19068614" from "anon";

revoke truncate on table "temp"."followers_19068614" from "anon";

revoke update on table "temp"."followers_19068614" from "anon";

revoke delete on table "temp"."followers_19068614" from "authenticated";

revoke insert on table "temp"."followers_19068614" from "authenticated";

revoke references on table "temp"."followers_19068614" from "authenticated";

revoke select on table "temp"."followers_19068614" from "authenticated";

revoke trigger on table "temp"."followers_19068614" from "authenticated";

revoke truncate on table "temp"."followers_19068614" from "authenticated";

revoke update on table "temp"."followers_19068614" from "authenticated";

revoke delete on table "temp"."followers_19068614" from "service_role";

revoke insert on table "temp"."followers_19068614" from "service_role";

revoke references on table "temp"."followers_19068614" from "service_role";

revoke select on table "temp"."followers_19068614" from "service_role";

revoke trigger on table "temp"."followers_19068614" from "service_role";

revoke truncate on table "temp"."followers_19068614" from "service_role";

revoke update on table "temp"."followers_19068614" from "service_role";

revoke delete on table "temp"."followers_2963358137" from "anon";

revoke insert on table "temp"."followers_2963358137" from "anon";

revoke references on table "temp"."followers_2963358137" from "anon";

revoke select on table "temp"."followers_2963358137" from "anon";

revoke trigger on table "temp"."followers_2963358137" from "anon";

revoke truncate on table "temp"."followers_2963358137" from "anon";

revoke update on table "temp"."followers_2963358137" from "anon";

revoke delete on table "temp"."followers_2963358137" from "authenticated";

revoke insert on table "temp"."followers_2963358137" from "authenticated";

revoke references on table "temp"."followers_2963358137" from "authenticated";

revoke select on table "temp"."followers_2963358137" from "authenticated";

revoke trigger on table "temp"."followers_2963358137" from "authenticated";

revoke truncate on table "temp"."followers_2963358137" from "authenticated";

revoke update on table "temp"."followers_2963358137" from "authenticated";

revoke delete on table "temp"."followers_2963358137" from "service_role";

revoke insert on table "temp"."followers_2963358137" from "service_role";

revoke references on table "temp"."followers_2963358137" from "service_role";

revoke select on table "temp"."followers_2963358137" from "service_role";

revoke trigger on table "temp"."followers_2963358137" from "service_role";

revoke truncate on table "temp"."followers_2963358137" from "service_role";

revoke update on table "temp"."followers_2963358137" from "service_role";

revoke delete on table "temp"."following_1360327512031711237" from "anon";

revoke insert on table "temp"."following_1360327512031711237" from "anon";

revoke references on table "temp"."following_1360327512031711237" from "anon";

revoke select on table "temp"."following_1360327512031711237" from "anon";

revoke trigger on table "temp"."following_1360327512031711237" from "anon";

revoke truncate on table "temp"."following_1360327512031711237" from "anon";

revoke update on table "temp"."following_1360327512031711237" from "anon";

revoke delete on table "temp"."following_1360327512031711237" from "authenticated";

revoke insert on table "temp"."following_1360327512031711237" from "authenticated";

revoke references on table "temp"."following_1360327512031711237" from "authenticated";

revoke select on table "temp"."following_1360327512031711237" from "authenticated";

revoke trigger on table "temp"."following_1360327512031711237" from "authenticated";

revoke truncate on table "temp"."following_1360327512031711237" from "authenticated";

revoke update on table "temp"."following_1360327512031711237" from "authenticated";

revoke delete on table "temp"."following_1360327512031711237" from "service_role";

revoke insert on table "temp"."following_1360327512031711237" from "service_role";

revoke references on table "temp"."following_1360327512031711237" from "service_role";

revoke select on table "temp"."following_1360327512031711237" from "service_role";

revoke trigger on table "temp"."following_1360327512031711237" from "service_role";

revoke truncate on table "temp"."following_1360327512031711237" from "service_role";

revoke update on table "temp"."following_1360327512031711237" from "service_role";

revoke delete on table "temp"."following_19068614" from "anon";

revoke insert on table "temp"."following_19068614" from "anon";

revoke references on table "temp"."following_19068614" from "anon";

revoke select on table "temp"."following_19068614" from "anon";

revoke trigger on table "temp"."following_19068614" from "anon";

revoke truncate on table "temp"."following_19068614" from "anon";

revoke update on table "temp"."following_19068614" from "anon";

revoke delete on table "temp"."following_19068614" from "authenticated";

revoke insert on table "temp"."following_19068614" from "authenticated";

revoke references on table "temp"."following_19068614" from "authenticated";

revoke select on table "temp"."following_19068614" from "authenticated";

revoke trigger on table "temp"."following_19068614" from "authenticated";

revoke truncate on table "temp"."following_19068614" from "authenticated";

revoke update on table "temp"."following_19068614" from "authenticated";

revoke delete on table "temp"."following_19068614" from "service_role";

revoke insert on table "temp"."following_19068614" from "service_role";

revoke references on table "temp"."following_19068614" from "service_role";

revoke select on table "temp"."following_19068614" from "service_role";

revoke trigger on table "temp"."following_19068614" from "service_role";

revoke truncate on table "temp"."following_19068614" from "service_role";

revoke update on table "temp"."following_19068614" from "service_role";

revoke delete on table "temp"."following_2963358137" from "anon";

revoke insert on table "temp"."following_2963358137" from "anon";

revoke references on table "temp"."following_2963358137" from "anon";

revoke select on table "temp"."following_2963358137" from "anon";

revoke trigger on table "temp"."following_2963358137" from "anon";

revoke truncate on table "temp"."following_2963358137" from "anon";

revoke update on table "temp"."following_2963358137" from "anon";

revoke delete on table "temp"."following_2963358137" from "authenticated";

revoke insert on table "temp"."following_2963358137" from "authenticated";

revoke references on table "temp"."following_2963358137" from "authenticated";

revoke select on table "temp"."following_2963358137" from "authenticated";

revoke trigger on table "temp"."following_2963358137" from "authenticated";

revoke truncate on table "temp"."following_2963358137" from "authenticated";

revoke update on table "temp"."following_2963358137" from "authenticated";

revoke delete on table "temp"."following_2963358137" from "service_role";

revoke insert on table "temp"."following_2963358137" from "service_role";

revoke references on table "temp"."following_2963358137" from "service_role";

revoke select on table "temp"."following_2963358137" from "service_role";

revoke trigger on table "temp"."following_2963358137" from "service_role";

revoke truncate on table "temp"."following_2963358137" from "service_role";

revoke update on table "temp"."following_2963358137" from "service_role";

revoke delete on table "temp"."liked_tweets_1360327512031711237" from "anon";

revoke insert on table "temp"."liked_tweets_1360327512031711237" from "anon";

revoke references on table "temp"."liked_tweets_1360327512031711237" from "anon";

revoke select on table "temp"."liked_tweets_1360327512031711237" from "anon";

revoke trigger on table "temp"."liked_tweets_1360327512031711237" from "anon";

revoke truncate on table "temp"."liked_tweets_1360327512031711237" from "anon";

revoke update on table "temp"."liked_tweets_1360327512031711237" from "anon";

revoke delete on table "temp"."liked_tweets_1360327512031711237" from "authenticated";

revoke insert on table "temp"."liked_tweets_1360327512031711237" from "authenticated";

revoke references on table "temp"."liked_tweets_1360327512031711237" from "authenticated";

revoke select on table "temp"."liked_tweets_1360327512031711237" from "authenticated";

revoke trigger on table "temp"."liked_tweets_1360327512031711237" from "authenticated";

revoke truncate on table "temp"."liked_tweets_1360327512031711237" from "authenticated";

revoke update on table "temp"."liked_tweets_1360327512031711237" from "authenticated";

revoke delete on table "temp"."liked_tweets_1360327512031711237" from "service_role";

revoke insert on table "temp"."liked_tweets_1360327512031711237" from "service_role";

revoke references on table "temp"."liked_tweets_1360327512031711237" from "service_role";

revoke select on table "temp"."liked_tweets_1360327512031711237" from "service_role";

revoke trigger on table "temp"."liked_tweets_1360327512031711237" from "service_role";

revoke truncate on table "temp"."liked_tweets_1360327512031711237" from "service_role";

revoke update on table "temp"."liked_tweets_1360327512031711237" from "service_role";

revoke delete on table "temp"."liked_tweets_19068614" from "anon";

revoke insert on table "temp"."liked_tweets_19068614" from "anon";

revoke references on table "temp"."liked_tweets_19068614" from "anon";

revoke select on table "temp"."liked_tweets_19068614" from "anon";

revoke trigger on table "temp"."liked_tweets_19068614" from "anon";

revoke truncate on table "temp"."liked_tweets_19068614" from "anon";

revoke update on table "temp"."liked_tweets_19068614" from "anon";

revoke delete on table "temp"."liked_tweets_19068614" from "authenticated";

revoke insert on table "temp"."liked_tweets_19068614" from "authenticated";

revoke references on table "temp"."liked_tweets_19068614" from "authenticated";

revoke select on table "temp"."liked_tweets_19068614" from "authenticated";

revoke trigger on table "temp"."liked_tweets_19068614" from "authenticated";

revoke truncate on table "temp"."liked_tweets_19068614" from "authenticated";

revoke update on table "temp"."liked_tweets_19068614" from "authenticated";

revoke delete on table "temp"."liked_tweets_19068614" from "service_role";

revoke insert on table "temp"."liked_tweets_19068614" from "service_role";

revoke references on table "temp"."liked_tweets_19068614" from "service_role";

revoke select on table "temp"."liked_tweets_19068614" from "service_role";

revoke trigger on table "temp"."liked_tweets_19068614" from "service_role";

revoke truncate on table "temp"."liked_tweets_19068614" from "service_role";

revoke update on table "temp"."liked_tweets_19068614" from "service_role";

revoke delete on table "temp"."liked_tweets_2963358137" from "anon";

revoke insert on table "temp"."liked_tweets_2963358137" from "anon";

revoke references on table "temp"."liked_tweets_2963358137" from "anon";

revoke select on table "temp"."liked_tweets_2963358137" from "anon";

revoke trigger on table "temp"."liked_tweets_2963358137" from "anon";

revoke truncate on table "temp"."liked_tweets_2963358137" from "anon";

revoke update on table "temp"."liked_tweets_2963358137" from "anon";

revoke delete on table "temp"."liked_tweets_2963358137" from "authenticated";

revoke insert on table "temp"."liked_tweets_2963358137" from "authenticated";

revoke references on table "temp"."liked_tweets_2963358137" from "authenticated";

revoke select on table "temp"."liked_tweets_2963358137" from "authenticated";

revoke trigger on table "temp"."liked_tweets_2963358137" from "authenticated";

revoke truncate on table "temp"."liked_tweets_2963358137" from "authenticated";

revoke update on table "temp"."liked_tweets_2963358137" from "authenticated";

revoke delete on table "temp"."liked_tweets_2963358137" from "service_role";

revoke insert on table "temp"."liked_tweets_2963358137" from "service_role";

revoke references on table "temp"."liked_tweets_2963358137" from "service_role";

revoke select on table "temp"."liked_tweets_2963358137" from "service_role";

revoke trigger on table "temp"."liked_tweets_2963358137" from "service_role";

revoke truncate on table "temp"."liked_tweets_2963358137" from "service_role";

revoke update on table "temp"."liked_tweets_2963358137" from "service_role";

revoke delete on table "temp"."likes_1360327512031711237" from "anon";

revoke insert on table "temp"."likes_1360327512031711237" from "anon";

revoke references on table "temp"."likes_1360327512031711237" from "anon";

revoke select on table "temp"."likes_1360327512031711237" from "anon";

revoke trigger on table "temp"."likes_1360327512031711237" from "anon";

revoke truncate on table "temp"."likes_1360327512031711237" from "anon";

revoke update on table "temp"."likes_1360327512031711237" from "anon";

revoke delete on table "temp"."likes_1360327512031711237" from "authenticated";

revoke insert on table "temp"."likes_1360327512031711237" from "authenticated";

revoke references on table "temp"."likes_1360327512031711237" from "authenticated";

revoke select on table "temp"."likes_1360327512031711237" from "authenticated";

revoke trigger on table "temp"."likes_1360327512031711237" from "authenticated";

revoke truncate on table "temp"."likes_1360327512031711237" from "authenticated";

revoke update on table "temp"."likes_1360327512031711237" from "authenticated";

revoke delete on table "temp"."likes_1360327512031711237" from "service_role";

revoke insert on table "temp"."likes_1360327512031711237" from "service_role";

revoke references on table "temp"."likes_1360327512031711237" from "service_role";

revoke select on table "temp"."likes_1360327512031711237" from "service_role";

revoke trigger on table "temp"."likes_1360327512031711237" from "service_role";

revoke truncate on table "temp"."likes_1360327512031711237" from "service_role";

revoke update on table "temp"."likes_1360327512031711237" from "service_role";

revoke delete on table "temp"."likes_19068614" from "anon";

revoke insert on table "temp"."likes_19068614" from "anon";

revoke references on table "temp"."likes_19068614" from "anon";

revoke select on table "temp"."likes_19068614" from "anon";

revoke trigger on table "temp"."likes_19068614" from "anon";

revoke truncate on table "temp"."likes_19068614" from "anon";

revoke update on table "temp"."likes_19068614" from "anon";

revoke delete on table "temp"."likes_19068614" from "authenticated";

revoke insert on table "temp"."likes_19068614" from "authenticated";

revoke references on table "temp"."likes_19068614" from "authenticated";

revoke select on table "temp"."likes_19068614" from "authenticated";

revoke trigger on table "temp"."likes_19068614" from "authenticated";

revoke truncate on table "temp"."likes_19068614" from "authenticated";

revoke update on table "temp"."likes_19068614" from "authenticated";

revoke delete on table "temp"."likes_19068614" from "service_role";

revoke insert on table "temp"."likes_19068614" from "service_role";

revoke references on table "temp"."likes_19068614" from "service_role";

revoke select on table "temp"."likes_19068614" from "service_role";

revoke trigger on table "temp"."likes_19068614" from "service_role";

revoke truncate on table "temp"."likes_19068614" from "service_role";

revoke update on table "temp"."likes_19068614" from "service_role";

revoke delete on table "temp"."likes_2963358137" from "anon";

revoke insert on table "temp"."likes_2963358137" from "anon";

revoke references on table "temp"."likes_2963358137" from "anon";

revoke select on table "temp"."likes_2963358137" from "anon";

revoke trigger on table "temp"."likes_2963358137" from "anon";

revoke truncate on table "temp"."likes_2963358137" from "anon";

revoke update on table "temp"."likes_2963358137" from "anon";

revoke delete on table "temp"."likes_2963358137" from "authenticated";

revoke insert on table "temp"."likes_2963358137" from "authenticated";

revoke references on table "temp"."likes_2963358137" from "authenticated";

revoke select on table "temp"."likes_2963358137" from "authenticated";

revoke trigger on table "temp"."likes_2963358137" from "authenticated";

revoke truncate on table "temp"."likes_2963358137" from "authenticated";

revoke update on table "temp"."likes_2963358137" from "authenticated";

revoke delete on table "temp"."likes_2963358137" from "service_role";

revoke insert on table "temp"."likes_2963358137" from "service_role";

revoke references on table "temp"."likes_2963358137" from "service_role";

revoke select on table "temp"."likes_2963358137" from "service_role";

revoke trigger on table "temp"."likes_2963358137" from "service_role";

revoke truncate on table "temp"."likes_2963358137" from "service_role";

revoke update on table "temp"."likes_2963358137" from "service_role";

revoke delete on table "temp"."mentioned_users_1360327512031711237" from "anon";

revoke insert on table "temp"."mentioned_users_1360327512031711237" from "anon";

revoke references on table "temp"."mentioned_users_1360327512031711237" from "anon";

revoke select on table "temp"."mentioned_users_1360327512031711237" from "anon";

revoke trigger on table "temp"."mentioned_users_1360327512031711237" from "anon";

revoke truncate on table "temp"."mentioned_users_1360327512031711237" from "anon";

revoke update on table "temp"."mentioned_users_1360327512031711237" from "anon";

revoke delete on table "temp"."mentioned_users_1360327512031711237" from "authenticated";

revoke insert on table "temp"."mentioned_users_1360327512031711237" from "authenticated";

revoke references on table "temp"."mentioned_users_1360327512031711237" from "authenticated";

revoke select on table "temp"."mentioned_users_1360327512031711237" from "authenticated";

revoke trigger on table "temp"."mentioned_users_1360327512031711237" from "authenticated";

revoke truncate on table "temp"."mentioned_users_1360327512031711237" from "authenticated";

revoke update on table "temp"."mentioned_users_1360327512031711237" from "authenticated";

revoke delete on table "temp"."mentioned_users_1360327512031711237" from "service_role";

revoke insert on table "temp"."mentioned_users_1360327512031711237" from "service_role";

revoke references on table "temp"."mentioned_users_1360327512031711237" from "service_role";

revoke select on table "temp"."mentioned_users_1360327512031711237" from "service_role";

revoke trigger on table "temp"."mentioned_users_1360327512031711237" from "service_role";

revoke truncate on table "temp"."mentioned_users_1360327512031711237" from "service_role";

revoke update on table "temp"."mentioned_users_1360327512031711237" from "service_role";

revoke delete on table "temp"."mentioned_users_19068614" from "anon";

revoke insert on table "temp"."mentioned_users_19068614" from "anon";

revoke references on table "temp"."mentioned_users_19068614" from "anon";

revoke select on table "temp"."mentioned_users_19068614" from "anon";

revoke trigger on table "temp"."mentioned_users_19068614" from "anon";

revoke truncate on table "temp"."mentioned_users_19068614" from "anon";

revoke update on table "temp"."mentioned_users_19068614" from "anon";

revoke delete on table "temp"."mentioned_users_19068614" from "authenticated";

revoke insert on table "temp"."mentioned_users_19068614" from "authenticated";

revoke references on table "temp"."mentioned_users_19068614" from "authenticated";

revoke select on table "temp"."mentioned_users_19068614" from "authenticated";

revoke trigger on table "temp"."mentioned_users_19068614" from "authenticated";

revoke truncate on table "temp"."mentioned_users_19068614" from "authenticated";

revoke update on table "temp"."mentioned_users_19068614" from "authenticated";

revoke delete on table "temp"."mentioned_users_19068614" from "service_role";

revoke insert on table "temp"."mentioned_users_19068614" from "service_role";

revoke references on table "temp"."mentioned_users_19068614" from "service_role";

revoke select on table "temp"."mentioned_users_19068614" from "service_role";

revoke trigger on table "temp"."mentioned_users_19068614" from "service_role";

revoke truncate on table "temp"."mentioned_users_19068614" from "service_role";

revoke update on table "temp"."mentioned_users_19068614" from "service_role";

revoke delete on table "temp"."mentioned_users_2963358137" from "anon";

revoke insert on table "temp"."mentioned_users_2963358137" from "anon";

revoke references on table "temp"."mentioned_users_2963358137" from "anon";

revoke select on table "temp"."mentioned_users_2963358137" from "anon";

revoke trigger on table "temp"."mentioned_users_2963358137" from "anon";

revoke truncate on table "temp"."mentioned_users_2963358137" from "anon";

revoke update on table "temp"."mentioned_users_2963358137" from "anon";

revoke delete on table "temp"."mentioned_users_2963358137" from "authenticated";

revoke insert on table "temp"."mentioned_users_2963358137" from "authenticated";

revoke references on table "temp"."mentioned_users_2963358137" from "authenticated";

revoke select on table "temp"."mentioned_users_2963358137" from "authenticated";

revoke trigger on table "temp"."mentioned_users_2963358137" from "authenticated";

revoke truncate on table "temp"."mentioned_users_2963358137" from "authenticated";

revoke update on table "temp"."mentioned_users_2963358137" from "authenticated";

revoke delete on table "temp"."mentioned_users_2963358137" from "service_role";

revoke insert on table "temp"."mentioned_users_2963358137" from "service_role";

revoke references on table "temp"."mentioned_users_2963358137" from "service_role";

revoke select on table "temp"."mentioned_users_2963358137" from "service_role";

revoke trigger on table "temp"."mentioned_users_2963358137" from "service_role";

revoke truncate on table "temp"."mentioned_users_2963358137" from "service_role";

revoke update on table "temp"."mentioned_users_2963358137" from "service_role";

revoke delete on table "temp"."profile_1360327512031711237" from "anon";

revoke insert on table "temp"."profile_1360327512031711237" from "anon";

revoke references on table "temp"."profile_1360327512031711237" from "anon";

revoke select on table "temp"."profile_1360327512031711237" from "anon";

revoke trigger on table "temp"."profile_1360327512031711237" from "anon";

revoke truncate on table "temp"."profile_1360327512031711237" from "anon";

revoke update on table "temp"."profile_1360327512031711237" from "anon";

revoke delete on table "temp"."profile_1360327512031711237" from "authenticated";

revoke insert on table "temp"."profile_1360327512031711237" from "authenticated";

revoke references on table "temp"."profile_1360327512031711237" from "authenticated";

revoke select on table "temp"."profile_1360327512031711237" from "authenticated";

revoke trigger on table "temp"."profile_1360327512031711237" from "authenticated";

revoke truncate on table "temp"."profile_1360327512031711237" from "authenticated";

revoke update on table "temp"."profile_1360327512031711237" from "authenticated";

revoke delete on table "temp"."profile_1360327512031711237" from "service_role";

revoke insert on table "temp"."profile_1360327512031711237" from "service_role";

revoke references on table "temp"."profile_1360327512031711237" from "service_role";

revoke select on table "temp"."profile_1360327512031711237" from "service_role";

revoke trigger on table "temp"."profile_1360327512031711237" from "service_role";

revoke truncate on table "temp"."profile_1360327512031711237" from "service_role";

revoke update on table "temp"."profile_1360327512031711237" from "service_role";

revoke delete on table "temp"."profile_19068614" from "anon";

revoke insert on table "temp"."profile_19068614" from "anon";

revoke references on table "temp"."profile_19068614" from "anon";

revoke select on table "temp"."profile_19068614" from "anon";

revoke trigger on table "temp"."profile_19068614" from "anon";

revoke truncate on table "temp"."profile_19068614" from "anon";

revoke update on table "temp"."profile_19068614" from "anon";

revoke delete on table "temp"."profile_19068614" from "authenticated";

revoke insert on table "temp"."profile_19068614" from "authenticated";

revoke references on table "temp"."profile_19068614" from "authenticated";

revoke select on table "temp"."profile_19068614" from "authenticated";

revoke trigger on table "temp"."profile_19068614" from "authenticated";

revoke truncate on table "temp"."profile_19068614" from "authenticated";

revoke update on table "temp"."profile_19068614" from "authenticated";

revoke delete on table "temp"."profile_19068614" from "service_role";

revoke insert on table "temp"."profile_19068614" from "service_role";

revoke references on table "temp"."profile_19068614" from "service_role";

revoke select on table "temp"."profile_19068614" from "service_role";

revoke trigger on table "temp"."profile_19068614" from "service_role";

revoke truncate on table "temp"."profile_19068614" from "service_role";

revoke update on table "temp"."profile_19068614" from "service_role";

revoke delete on table "temp"."profile_2963358137" from "anon";

revoke insert on table "temp"."profile_2963358137" from "anon";

revoke references on table "temp"."profile_2963358137" from "anon";

revoke select on table "temp"."profile_2963358137" from "anon";

revoke trigger on table "temp"."profile_2963358137" from "anon";

revoke truncate on table "temp"."profile_2963358137" from "anon";

revoke update on table "temp"."profile_2963358137" from "anon";

revoke delete on table "temp"."profile_2963358137" from "authenticated";

revoke insert on table "temp"."profile_2963358137" from "authenticated";

revoke references on table "temp"."profile_2963358137" from "authenticated";

revoke select on table "temp"."profile_2963358137" from "authenticated";

revoke trigger on table "temp"."profile_2963358137" from "authenticated";

revoke truncate on table "temp"."profile_2963358137" from "authenticated";

revoke update on table "temp"."profile_2963358137" from "authenticated";

revoke delete on table "temp"."profile_2963358137" from "service_role";

revoke insert on table "temp"."profile_2963358137" from "service_role";

revoke references on table "temp"."profile_2963358137" from "service_role";

revoke select on table "temp"."profile_2963358137" from "service_role";

revoke trigger on table "temp"."profile_2963358137" from "service_role";

revoke truncate on table "temp"."profile_2963358137" from "service_role";

revoke update on table "temp"."profile_2963358137" from "service_role";

revoke delete on table "temp"."tweet_media_1360327512031711237" from "anon";

revoke insert on table "temp"."tweet_media_1360327512031711237" from "anon";

revoke references on table "temp"."tweet_media_1360327512031711237" from "anon";

revoke select on table "temp"."tweet_media_1360327512031711237" from "anon";

revoke trigger on table "temp"."tweet_media_1360327512031711237" from "anon";

revoke truncate on table "temp"."tweet_media_1360327512031711237" from "anon";

revoke update on table "temp"."tweet_media_1360327512031711237" from "anon";

revoke delete on table "temp"."tweet_media_1360327512031711237" from "authenticated";

revoke insert on table "temp"."tweet_media_1360327512031711237" from "authenticated";

revoke references on table "temp"."tweet_media_1360327512031711237" from "authenticated";

revoke select on table "temp"."tweet_media_1360327512031711237" from "authenticated";

revoke trigger on table "temp"."tweet_media_1360327512031711237" from "authenticated";

revoke truncate on table "temp"."tweet_media_1360327512031711237" from "authenticated";

revoke update on table "temp"."tweet_media_1360327512031711237" from "authenticated";

revoke delete on table "temp"."tweet_media_1360327512031711237" from "service_role";

revoke insert on table "temp"."tweet_media_1360327512031711237" from "service_role";

revoke references on table "temp"."tweet_media_1360327512031711237" from "service_role";

revoke select on table "temp"."tweet_media_1360327512031711237" from "service_role";

revoke trigger on table "temp"."tweet_media_1360327512031711237" from "service_role";

revoke truncate on table "temp"."tweet_media_1360327512031711237" from "service_role";

revoke update on table "temp"."tweet_media_1360327512031711237" from "service_role";

revoke delete on table "temp"."tweet_media_19068614" from "anon";

revoke insert on table "temp"."tweet_media_19068614" from "anon";

revoke references on table "temp"."tweet_media_19068614" from "anon";

revoke select on table "temp"."tweet_media_19068614" from "anon";

revoke trigger on table "temp"."tweet_media_19068614" from "anon";

revoke truncate on table "temp"."tweet_media_19068614" from "anon";

revoke update on table "temp"."tweet_media_19068614" from "anon";

revoke delete on table "temp"."tweet_media_19068614" from "authenticated";

revoke insert on table "temp"."tweet_media_19068614" from "authenticated";

revoke references on table "temp"."tweet_media_19068614" from "authenticated";

revoke select on table "temp"."tweet_media_19068614" from "authenticated";

revoke trigger on table "temp"."tweet_media_19068614" from "authenticated";

revoke truncate on table "temp"."tweet_media_19068614" from "authenticated";

revoke update on table "temp"."tweet_media_19068614" from "authenticated";

revoke delete on table "temp"."tweet_media_19068614" from "service_role";

revoke insert on table "temp"."tweet_media_19068614" from "service_role";

revoke references on table "temp"."tweet_media_19068614" from "service_role";

revoke select on table "temp"."tweet_media_19068614" from "service_role";

revoke trigger on table "temp"."tweet_media_19068614" from "service_role";

revoke truncate on table "temp"."tweet_media_19068614" from "service_role";

revoke update on table "temp"."tweet_media_19068614" from "service_role";

revoke delete on table "temp"."tweet_media_2963358137" from "anon";

revoke insert on table "temp"."tweet_media_2963358137" from "anon";

revoke references on table "temp"."tweet_media_2963358137" from "anon";

revoke select on table "temp"."tweet_media_2963358137" from "anon";

revoke trigger on table "temp"."tweet_media_2963358137" from "anon";

revoke truncate on table "temp"."tweet_media_2963358137" from "anon";

revoke update on table "temp"."tweet_media_2963358137" from "anon";

revoke delete on table "temp"."tweet_media_2963358137" from "authenticated";

revoke insert on table "temp"."tweet_media_2963358137" from "authenticated";

revoke references on table "temp"."tweet_media_2963358137" from "authenticated";

revoke select on table "temp"."tweet_media_2963358137" from "authenticated";

revoke trigger on table "temp"."tweet_media_2963358137" from "authenticated";

revoke truncate on table "temp"."tweet_media_2963358137" from "authenticated";

revoke update on table "temp"."tweet_media_2963358137" from "authenticated";

revoke delete on table "temp"."tweet_media_2963358137" from "service_role";

revoke insert on table "temp"."tweet_media_2963358137" from "service_role";

revoke references on table "temp"."tweet_media_2963358137" from "service_role";

revoke select on table "temp"."tweet_media_2963358137" from "service_role";

revoke trigger on table "temp"."tweet_media_2963358137" from "service_role";

revoke truncate on table "temp"."tweet_media_2963358137" from "service_role";

revoke update on table "temp"."tweet_media_2963358137" from "service_role";

revoke delete on table "temp"."tweet_urls_1360327512031711237" from "anon";

revoke insert on table "temp"."tweet_urls_1360327512031711237" from "anon";

revoke references on table "temp"."tweet_urls_1360327512031711237" from "anon";

revoke select on table "temp"."tweet_urls_1360327512031711237" from "anon";

revoke trigger on table "temp"."tweet_urls_1360327512031711237" from "anon";

revoke truncate on table "temp"."tweet_urls_1360327512031711237" from "anon";

revoke update on table "temp"."tweet_urls_1360327512031711237" from "anon";

revoke delete on table "temp"."tweet_urls_1360327512031711237" from "authenticated";

revoke insert on table "temp"."tweet_urls_1360327512031711237" from "authenticated";

revoke references on table "temp"."tweet_urls_1360327512031711237" from "authenticated";

revoke select on table "temp"."tweet_urls_1360327512031711237" from "authenticated";

revoke trigger on table "temp"."tweet_urls_1360327512031711237" from "authenticated";

revoke truncate on table "temp"."tweet_urls_1360327512031711237" from "authenticated";

revoke update on table "temp"."tweet_urls_1360327512031711237" from "authenticated";

revoke delete on table "temp"."tweet_urls_1360327512031711237" from "service_role";

revoke insert on table "temp"."tweet_urls_1360327512031711237" from "service_role";

revoke references on table "temp"."tweet_urls_1360327512031711237" from "service_role";

revoke select on table "temp"."tweet_urls_1360327512031711237" from "service_role";

revoke trigger on table "temp"."tweet_urls_1360327512031711237" from "service_role";

revoke truncate on table "temp"."tweet_urls_1360327512031711237" from "service_role";

revoke update on table "temp"."tweet_urls_1360327512031711237" from "service_role";

revoke delete on table "temp"."tweet_urls_19068614" from "anon";

revoke insert on table "temp"."tweet_urls_19068614" from "anon";

revoke references on table "temp"."tweet_urls_19068614" from "anon";

revoke select on table "temp"."tweet_urls_19068614" from "anon";

revoke trigger on table "temp"."tweet_urls_19068614" from "anon";

revoke truncate on table "temp"."tweet_urls_19068614" from "anon";

revoke update on table "temp"."tweet_urls_19068614" from "anon";

revoke delete on table "temp"."tweet_urls_19068614" from "authenticated";

revoke insert on table "temp"."tweet_urls_19068614" from "authenticated";

revoke references on table "temp"."tweet_urls_19068614" from "authenticated";

revoke select on table "temp"."tweet_urls_19068614" from "authenticated";

revoke trigger on table "temp"."tweet_urls_19068614" from "authenticated";

revoke truncate on table "temp"."tweet_urls_19068614" from "authenticated";

revoke update on table "temp"."tweet_urls_19068614" from "authenticated";

revoke delete on table "temp"."tweet_urls_19068614" from "service_role";

revoke insert on table "temp"."tweet_urls_19068614" from "service_role";

revoke references on table "temp"."tweet_urls_19068614" from "service_role";

revoke select on table "temp"."tweet_urls_19068614" from "service_role";

revoke trigger on table "temp"."tweet_urls_19068614" from "service_role";

revoke truncate on table "temp"."tweet_urls_19068614" from "service_role";

revoke update on table "temp"."tweet_urls_19068614" from "service_role";

revoke delete on table "temp"."tweet_urls_2963358137" from "anon";

revoke insert on table "temp"."tweet_urls_2963358137" from "anon";

revoke references on table "temp"."tweet_urls_2963358137" from "anon";

revoke select on table "temp"."tweet_urls_2963358137" from "anon";

revoke trigger on table "temp"."tweet_urls_2963358137" from "anon";

revoke truncate on table "temp"."tweet_urls_2963358137" from "anon";

revoke update on table "temp"."tweet_urls_2963358137" from "anon";

revoke delete on table "temp"."tweet_urls_2963358137" from "authenticated";

revoke insert on table "temp"."tweet_urls_2963358137" from "authenticated";

revoke references on table "temp"."tweet_urls_2963358137" from "authenticated";

revoke select on table "temp"."tweet_urls_2963358137" from "authenticated";

revoke trigger on table "temp"."tweet_urls_2963358137" from "authenticated";

revoke truncate on table "temp"."tweet_urls_2963358137" from "authenticated";

revoke update on table "temp"."tweet_urls_2963358137" from "authenticated";

revoke delete on table "temp"."tweet_urls_2963358137" from "service_role";

revoke insert on table "temp"."tweet_urls_2963358137" from "service_role";

revoke references on table "temp"."tweet_urls_2963358137" from "service_role";

revoke select on table "temp"."tweet_urls_2963358137" from "service_role";

revoke trigger on table "temp"."tweet_urls_2963358137" from "service_role";

revoke truncate on table "temp"."tweet_urls_2963358137" from "service_role";

revoke update on table "temp"."tweet_urls_2963358137" from "service_role";

revoke delete on table "temp"."tweets_1360327512031711237" from "anon";

revoke insert on table "temp"."tweets_1360327512031711237" from "anon";

revoke references on table "temp"."tweets_1360327512031711237" from "anon";

revoke select on table "temp"."tweets_1360327512031711237" from "anon";

revoke trigger on table "temp"."tweets_1360327512031711237" from "anon";

revoke truncate on table "temp"."tweets_1360327512031711237" from "anon";

revoke update on table "temp"."tweets_1360327512031711237" from "anon";

revoke delete on table "temp"."tweets_1360327512031711237" from "authenticated";

revoke insert on table "temp"."tweets_1360327512031711237" from "authenticated";

revoke references on table "temp"."tweets_1360327512031711237" from "authenticated";

revoke select on table "temp"."tweets_1360327512031711237" from "authenticated";

revoke trigger on table "temp"."tweets_1360327512031711237" from "authenticated";

revoke truncate on table "temp"."tweets_1360327512031711237" from "authenticated";

revoke update on table "temp"."tweets_1360327512031711237" from "authenticated";

revoke delete on table "temp"."tweets_1360327512031711237" from "service_role";

revoke insert on table "temp"."tweets_1360327512031711237" from "service_role";

revoke references on table "temp"."tweets_1360327512031711237" from "service_role";

revoke select on table "temp"."tweets_1360327512031711237" from "service_role";

revoke trigger on table "temp"."tweets_1360327512031711237" from "service_role";

revoke truncate on table "temp"."tweets_1360327512031711237" from "service_role";

revoke update on table "temp"."tweets_1360327512031711237" from "service_role";

revoke delete on table "temp"."tweets_19068614" from "anon";

revoke insert on table "temp"."tweets_19068614" from "anon";

revoke references on table "temp"."tweets_19068614" from "anon";

revoke select on table "temp"."tweets_19068614" from "anon";

revoke trigger on table "temp"."tweets_19068614" from "anon";

revoke truncate on table "temp"."tweets_19068614" from "anon";

revoke update on table "temp"."tweets_19068614" from "anon";

revoke delete on table "temp"."tweets_19068614" from "authenticated";

revoke insert on table "temp"."tweets_19068614" from "authenticated";

revoke references on table "temp"."tweets_19068614" from "authenticated";

revoke select on table "temp"."tweets_19068614" from "authenticated";

revoke trigger on table "temp"."tweets_19068614" from "authenticated";

revoke truncate on table "temp"."tweets_19068614" from "authenticated";

revoke update on table "temp"."tweets_19068614" from "authenticated";

revoke delete on table "temp"."tweets_19068614" from "service_role";

revoke insert on table "temp"."tweets_19068614" from "service_role";

revoke references on table "temp"."tweets_19068614" from "service_role";

revoke select on table "temp"."tweets_19068614" from "service_role";

revoke trigger on table "temp"."tweets_19068614" from "service_role";

revoke truncate on table "temp"."tweets_19068614" from "service_role";

revoke update on table "temp"."tweets_19068614" from "service_role";

revoke delete on table "temp"."tweets_2963358137" from "anon";

revoke insert on table "temp"."tweets_2963358137" from "anon";

revoke references on table "temp"."tweets_2963358137" from "anon";

revoke select on table "temp"."tweets_2963358137" from "anon";

revoke trigger on table "temp"."tweets_2963358137" from "anon";

revoke truncate on table "temp"."tweets_2963358137" from "anon";

revoke update on table "temp"."tweets_2963358137" from "anon";

revoke delete on table "temp"."tweets_2963358137" from "authenticated";

revoke insert on table "temp"."tweets_2963358137" from "authenticated";

revoke references on table "temp"."tweets_2963358137" from "authenticated";

revoke select on table "temp"."tweets_2963358137" from "authenticated";

revoke trigger on table "temp"."tweets_2963358137" from "authenticated";

revoke truncate on table "temp"."tweets_2963358137" from "authenticated";

revoke update on table "temp"."tweets_2963358137" from "authenticated";

revoke delete on table "temp"."tweets_2963358137" from "service_role";

revoke insert on table "temp"."tweets_2963358137" from "service_role";

revoke references on table "temp"."tweets_2963358137" from "service_role";

revoke select on table "temp"."tweets_2963358137" from "service_role";

revoke trigger on table "temp"."tweets_2963358137" from "service_role";

revoke truncate on table "temp"."tweets_2963358137" from "service_role";

revoke update on table "temp"."tweets_2963358137" from "service_role";

revoke delete on table "temp"."user_mentions_1360327512031711237" from "anon";

revoke insert on table "temp"."user_mentions_1360327512031711237" from "anon";

revoke references on table "temp"."user_mentions_1360327512031711237" from "anon";

revoke select on table "temp"."user_mentions_1360327512031711237" from "anon";

revoke trigger on table "temp"."user_mentions_1360327512031711237" from "anon";

revoke truncate on table "temp"."user_mentions_1360327512031711237" from "anon";

revoke update on table "temp"."user_mentions_1360327512031711237" from "anon";

revoke delete on table "temp"."user_mentions_1360327512031711237" from "authenticated";

revoke insert on table "temp"."user_mentions_1360327512031711237" from "authenticated";

revoke references on table "temp"."user_mentions_1360327512031711237" from "authenticated";

revoke select on table "temp"."user_mentions_1360327512031711237" from "authenticated";

revoke trigger on table "temp"."user_mentions_1360327512031711237" from "authenticated";

revoke truncate on table "temp"."user_mentions_1360327512031711237" from "authenticated";

revoke update on table "temp"."user_mentions_1360327512031711237" from "authenticated";

revoke delete on table "temp"."user_mentions_1360327512031711237" from "service_role";

revoke insert on table "temp"."user_mentions_1360327512031711237" from "service_role";

revoke references on table "temp"."user_mentions_1360327512031711237" from "service_role";

revoke select on table "temp"."user_mentions_1360327512031711237" from "service_role";

revoke trigger on table "temp"."user_mentions_1360327512031711237" from "service_role";

revoke truncate on table "temp"."user_mentions_1360327512031711237" from "service_role";

revoke update on table "temp"."user_mentions_1360327512031711237" from "service_role";

revoke delete on table "temp"."user_mentions_19068614" from "anon";

revoke insert on table "temp"."user_mentions_19068614" from "anon";

revoke references on table "temp"."user_mentions_19068614" from "anon";

revoke select on table "temp"."user_mentions_19068614" from "anon";

revoke trigger on table "temp"."user_mentions_19068614" from "anon";

revoke truncate on table "temp"."user_mentions_19068614" from "anon";

revoke update on table "temp"."user_mentions_19068614" from "anon";

revoke delete on table "temp"."user_mentions_19068614" from "authenticated";

revoke insert on table "temp"."user_mentions_19068614" from "authenticated";

revoke references on table "temp"."user_mentions_19068614" from "authenticated";

revoke select on table "temp"."user_mentions_19068614" from "authenticated";

revoke trigger on table "temp"."user_mentions_19068614" from "authenticated";

revoke truncate on table "temp"."user_mentions_19068614" from "authenticated";

revoke update on table "temp"."user_mentions_19068614" from "authenticated";

revoke delete on table "temp"."user_mentions_19068614" from "service_role";

revoke insert on table "temp"."user_mentions_19068614" from "service_role";

revoke references on table "temp"."user_mentions_19068614" from "service_role";

revoke select on table "temp"."user_mentions_19068614" from "service_role";

revoke trigger on table "temp"."user_mentions_19068614" from "service_role";

revoke truncate on table "temp"."user_mentions_19068614" from "service_role";

revoke update on table "temp"."user_mentions_19068614" from "service_role";

revoke delete on table "temp"."user_mentions_2963358137" from "anon";

revoke insert on table "temp"."user_mentions_2963358137" from "anon";

revoke references on table "temp"."user_mentions_2963358137" from "anon";

revoke select on table "temp"."user_mentions_2963358137" from "anon";

revoke trigger on table "temp"."user_mentions_2963358137" from "anon";

revoke truncate on table "temp"."user_mentions_2963358137" from "anon";

revoke update on table "temp"."user_mentions_2963358137" from "anon";

revoke delete on table "temp"."user_mentions_2963358137" from "authenticated";

revoke insert on table "temp"."user_mentions_2963358137" from "authenticated";

revoke references on table "temp"."user_mentions_2963358137" from "authenticated";

revoke select on table "temp"."user_mentions_2963358137" from "authenticated";

revoke trigger on table "temp"."user_mentions_2963358137" from "authenticated";

revoke truncate on table "temp"."user_mentions_2963358137" from "authenticated";

revoke update on table "temp"."user_mentions_2963358137" from "authenticated";

revoke delete on table "temp"."user_mentions_2963358137" from "service_role";

revoke insert on table "temp"."user_mentions_2963358137" from "service_role";

revoke references on table "temp"."user_mentions_2963358137" from "service_role";

revoke select on table "temp"."user_mentions_2963358137" from "service_role";

revoke trigger on table "temp"."user_mentions_2963358137" from "service_role";

revoke truncate on table "temp"."user_mentions_2963358137" from "service_role";

revoke update on table "temp"."user_mentions_2963358137" from "service_role";

alter table "temp"."archive_upload_1360327512031711237" drop constraint "archive_upload_1360327512031711237_account_id_archive_at_key";

alter table "temp"."archive_upload_19068614" drop constraint "archive_upload_19068614_account_id_archive_at_key";

alter table "temp"."archive_upload_2963358137" drop constraint "archive_upload_2963358137_account_id_archive_at_key";

alter table "temp"."followers_1360327512031711237" drop constraint "followers_1360327512031711237_account_id_follower_account_i_key";

alter table "temp"."followers_19068614" drop constraint "followers_19068614_account_id_follower_account_id_key";

alter table "temp"."followers_2963358137" drop constraint "followers_2963358137_account_id_follower_account_id_key";

alter table "temp"."following_1360327512031711237" drop constraint "following_1360327512031711237_account_id_following_account__key";

alter table "temp"."following_19068614" drop constraint "following_19068614_account_id_following_account_id_key";

alter table "temp"."following_2963358137" drop constraint "following_2963358137_account_id_following_account_id_key";

alter table "temp"."likes_1360327512031711237" drop constraint "likes_1360327512031711237_account_id_liked_tweet_id_key";

alter table "temp"."likes_19068614" drop constraint "likes_19068614_account_id_liked_tweet_id_key";

alter table "temp"."likes_2963358137" drop constraint "likes_2963358137_account_id_liked_tweet_id_key";

alter table "temp"."tweet_urls_1360327512031711237" drop constraint "tweet_urls_1360327512031711237_tweet_id_url_key";

alter table "temp"."tweet_urls_19068614" drop constraint "tweet_urls_19068614_tweet_id_url_key";

alter table "temp"."tweet_urls_2963358137" drop constraint "tweet_urls_2963358137_tweet_id_url_key";

alter table "temp"."user_mentions_1360327512031711237" drop constraint "user_mentions_136032751203171123_mentioned_user_id_tweet_id_key";

alter table "temp"."user_mentions_19068614" drop constraint "user_mentions_19068614_mentioned_user_id_tweet_id_key";

alter table "temp"."user_mentions_2963358137" drop constraint "user_mentions_2963358137_mentioned_user_id_tweet_id_key";

alter table "temp"."archive_upload_1360327512031711237" drop constraint "archive_upload_1360327512031711237_pkey";

alter table "temp"."archive_upload_19068614" drop constraint "archive_upload_19068614_pkey";

alter table "temp"."archive_upload_2963358137" drop constraint "archive_upload_2963358137_pkey";

alter table "temp"."followers_1360327512031711237" drop constraint "followers_1360327512031711237_pkey";

alter table "temp"."followers_19068614" drop constraint "followers_19068614_pkey";

alter table "temp"."followers_2963358137" drop constraint "followers_2963358137_pkey";

alter table "temp"."following_1360327512031711237" drop constraint "following_1360327512031711237_pkey";

alter table "temp"."following_19068614" drop constraint "following_19068614_pkey";

alter table "temp"."following_2963358137" drop constraint "following_2963358137_pkey";

alter table "temp"."liked_tweets_1360327512031711237" drop constraint "liked_tweets_1360327512031711237_pkey";

alter table "temp"."liked_tweets_19068614" drop constraint "liked_tweets_19068614_pkey";

alter table "temp"."liked_tweets_2963358137" drop constraint "liked_tweets_2963358137_pkey";

alter table "temp"."likes_1360327512031711237" drop constraint "likes_1360327512031711237_pkey";

alter table "temp"."likes_19068614" drop constraint "likes_19068614_pkey";

alter table "temp"."likes_2963358137" drop constraint "likes_2963358137_pkey";

alter table "temp"."mentioned_users_1360327512031711237" drop constraint "mentioned_users_1360327512031711237_pkey";

alter table "temp"."mentioned_users_19068614" drop constraint "mentioned_users_19068614_pkey";

alter table "temp"."mentioned_users_2963358137" drop constraint "mentioned_users_2963358137_pkey";

alter table "temp"."tweet_media_1360327512031711237" drop constraint "tweet_media_1360327512031711237_pkey";

alter table "temp"."tweet_media_19068614" drop constraint "tweet_media_19068614_pkey";

alter table "temp"."tweet_media_2963358137" drop constraint "tweet_media_2963358137_pkey";

alter table "temp"."tweet_urls_1360327512031711237" drop constraint "tweet_urls_1360327512031711237_pkey";

alter table "temp"."tweet_urls_19068614" drop constraint "tweet_urls_19068614_pkey";

alter table "temp"."tweet_urls_2963358137" drop constraint "tweet_urls_2963358137_pkey";

alter table "temp"."tweets_1360327512031711237" drop constraint "tweets_1360327512031711237_pkey";

alter table "temp"."tweets_19068614" drop constraint "tweets_19068614_pkey";

alter table "temp"."tweets_2963358137" drop constraint "tweets_2963358137_pkey";

alter table "temp"."user_mentions_1360327512031711237" drop constraint "user_mentions_1360327512031711237_pkey";

alter table "temp"."user_mentions_19068614" drop constraint "user_mentions_19068614_pkey";

alter table "temp"."user_mentions_2963358137" drop constraint "user_mentions_2963358137_pkey";

drop index if exists "temp"."archive_upload_1360327512031711237_account_id_archive_at_key";

drop index if exists "temp"."archive_upload_1360327512031711237_account_id_idx";

drop index if exists "temp"."archive_upload_1360327512031711237_pkey";

drop index if exists "temp"."archive_upload_19068614_account_id_archive_at_key";

drop index if exists "temp"."archive_upload_19068614_account_id_idx";

drop index if exists "temp"."archive_upload_19068614_pkey";

drop index if exists "temp"."archive_upload_2963358137_account_id_archive_at_key";

drop index if exists "temp"."archive_upload_2963358137_account_id_idx";

drop index if exists "temp"."archive_upload_2963358137_pkey";

drop index if exists "temp"."followers_1360327512031711237_account_id_follower_account_i_key";

drop index if exists "temp"."followers_1360327512031711237_account_id_idx";

drop index if exists "temp"."followers_1360327512031711237_archive_upload_id_idx";

drop index if exists "temp"."followers_1360327512031711237_pkey";

drop index if exists "temp"."followers_19068614_account_id_follower_account_id_key";

drop index if exists "temp"."followers_19068614_account_id_idx";

drop index if exists "temp"."followers_19068614_archive_upload_id_idx";

drop index if exists "temp"."followers_19068614_pkey";

drop index if exists "temp"."followers_2963358137_account_id_follower_account_id_key";

drop index if exists "temp"."followers_2963358137_account_id_idx";

drop index if exists "temp"."followers_2963358137_archive_upload_id_idx";

drop index if exists "temp"."followers_2963358137_pkey";

drop index if exists "temp"."following_1360327512031711237_account_id_following_account__key";

drop index if exists "temp"."following_1360327512031711237_account_id_idx";

drop index if exists "temp"."following_1360327512031711237_archive_upload_id_idx";

drop index if exists "temp"."following_1360327512031711237_pkey";

drop index if exists "temp"."following_19068614_account_id_following_account_id_key";

drop index if exists "temp"."following_19068614_account_id_idx";

drop index if exists "temp"."following_19068614_archive_upload_id_idx";

drop index if exists "temp"."following_19068614_pkey";

drop index if exists "temp"."following_2963358137_account_id_following_account_id_key";

drop index if exists "temp"."following_2963358137_account_id_idx";

drop index if exists "temp"."following_2963358137_archive_upload_id_idx";

drop index if exists "temp"."following_2963358137_pkey";

drop index if exists "temp"."liked_tweets_1360327512031711237_pkey";

drop index if exists "temp"."liked_tweets_19068614_pkey";

drop index if exists "temp"."liked_tweets_2963358137_pkey";

drop index if exists "temp"."likes_1360327512031711237_account_id_idx";

drop index if exists "temp"."likes_1360327512031711237_account_id_idx1";

drop index if exists "temp"."likes_1360327512031711237_account_id_liked_tweet_id_key";

drop index if exists "temp"."likes_1360327512031711237_archive_upload_id_idx";

drop index if exists "temp"."likes_1360327512031711237_liked_tweet_id_idx";

drop index if exists "temp"."likes_1360327512031711237_pkey";

drop index if exists "temp"."likes_19068614_account_id_idx";

drop index if exists "temp"."likes_19068614_account_id_idx1";

drop index if exists "temp"."likes_19068614_account_id_liked_tweet_id_key";

drop index if exists "temp"."likes_19068614_archive_upload_id_idx";

drop index if exists "temp"."likes_19068614_liked_tweet_id_idx";

drop index if exists "temp"."likes_19068614_pkey";

drop index if exists "temp"."likes_2963358137_account_id_idx";

drop index if exists "temp"."likes_2963358137_account_id_idx1";

drop index if exists "temp"."likes_2963358137_account_id_liked_tweet_id_key";

drop index if exists "temp"."likes_2963358137_archive_upload_id_idx";

drop index if exists "temp"."likes_2963358137_liked_tweet_id_idx";

drop index if exists "temp"."likes_2963358137_pkey";

drop index if exists "temp"."mentioned_users_1360327512031711237_pkey";

drop index if exists "temp"."mentioned_users_1360327512031711237_user_id_idx";

drop index if exists "temp"."mentioned_users_19068614_pkey";

drop index if exists "temp"."mentioned_users_19068614_user_id_idx";

drop index if exists "temp"."mentioned_users_2963358137_pkey";

drop index if exists "temp"."mentioned_users_2963358137_user_id_idx";

drop index if exists "temp"."tweet_media_1360327512031711237_archive_upload_id_idx";

drop index if exists "temp"."tweet_media_1360327512031711237_pkey";

drop index if exists "temp"."tweet_media_1360327512031711237_tweet_id_idx";

drop index if exists "temp"."tweet_media_19068614_archive_upload_id_idx";

drop index if exists "temp"."tweet_media_19068614_pkey";

drop index if exists "temp"."tweet_media_19068614_tweet_id_idx";

drop index if exists "temp"."tweet_media_2963358137_archive_upload_id_idx";

drop index if exists "temp"."tweet_media_2963358137_pkey";

drop index if exists "temp"."tweet_media_2963358137_tweet_id_idx";

drop index if exists "temp"."tweet_urls_1360327512031711237_expanded_url_idx";

drop index if exists "temp"."tweet_urls_1360327512031711237_pkey";

drop index if exists "temp"."tweet_urls_1360327512031711237_tweet_id_idx";

drop index if exists "temp"."tweet_urls_1360327512031711237_tweet_id_url_key";

drop index if exists "temp"."tweet_urls_19068614_expanded_url_idx";

drop index if exists "temp"."tweet_urls_19068614_pkey";

drop index if exists "temp"."tweet_urls_19068614_tweet_id_idx";

drop index if exists "temp"."tweet_urls_19068614_tweet_id_url_key";

drop index if exists "temp"."tweet_urls_2963358137_expanded_url_idx";

drop index if exists "temp"."tweet_urls_2963358137_pkey";

drop index if exists "temp"."tweet_urls_2963358137_tweet_id_idx";

drop index if exists "temp"."tweet_urls_2963358137_tweet_id_url_key";

drop index if exists "temp"."tweets_1360327512031711237_account_id_created_at_tweet_id_f_idx";

drop index if exists "temp"."tweets_1360327512031711237_account_id_expr_idx";

drop index if exists "temp"."tweets_1360327512031711237_account_id_favorite_count_idx";

drop index if exists "temp"."tweets_1360327512031711237_account_id_idx";

drop index if exists "temp"."tweets_1360327512031711237_account_id_retweet_count_idx";

drop index if exists "temp"."tweets_1360327512031711237_archive_upload_id_idx";

drop index if exists "temp"."tweets_1360327512031711237_created_at_idx";

drop index if exists "temp"."tweets_1360327512031711237_created_at_idx1";

drop index if exists "temp"."tweets_1360327512031711237_created_at_idx2";

drop index if exists "temp"."tweets_1360327512031711237_created_at_idx3";

drop index if exists "temp"."tweets_1360327512031711237_favorite_count_idx";

drop index if exists "temp"."tweets_1360327512031711237_fts_idx";

drop index if exists "temp"."tweets_1360327512031711237_pkey";

drop index if exists "temp"."tweets_1360327512031711237_reply_to_tweet_id_idx";

drop index if exists "temp"."tweets_1360327512031711237_reply_to_user_id_idx";

drop index if exists "temp"."tweets_1360327512031711237_updated_at_idx";

drop index if exists "temp"."tweets_1360327512031711237_updated_at_idx1";

drop index if exists "temp"."tweets_1360327512031711237_updated_at_tweet_id_idx";

drop index if exists "temp"."tweets_19068614_account_id_created_at_tweet_id_full_text_fa_idx";

drop index if exists "temp"."tweets_19068614_account_id_expr_idx";

drop index if exists "temp"."tweets_19068614_account_id_favorite_count_idx";

drop index if exists "temp"."tweets_19068614_account_id_idx";

drop index if exists "temp"."tweets_19068614_account_id_retweet_count_idx";

drop index if exists "temp"."tweets_19068614_archive_upload_id_idx";

drop index if exists "temp"."tweets_19068614_created_at_idx";

drop index if exists "temp"."tweets_19068614_created_at_idx1";

drop index if exists "temp"."tweets_19068614_created_at_idx2";

drop index if exists "temp"."tweets_19068614_created_at_idx3";

drop index if exists "temp"."tweets_19068614_favorite_count_idx";

drop index if exists "temp"."tweets_19068614_fts_idx";

drop index if exists "temp"."tweets_19068614_pkey";

drop index if exists "temp"."tweets_19068614_reply_to_tweet_id_idx";

drop index if exists "temp"."tweets_19068614_reply_to_user_id_idx";

drop index if exists "temp"."tweets_19068614_updated_at_idx";

drop index if exists "temp"."tweets_19068614_updated_at_idx1";

drop index if exists "temp"."tweets_19068614_updated_at_tweet_id_idx";

drop index if exists "temp"."tweets_2963358137_account_id_created_at_tweet_id_full_text__idx";

drop index if exists "temp"."tweets_2963358137_account_id_expr_idx";

drop index if exists "temp"."tweets_2963358137_account_id_favorite_count_idx";

drop index if exists "temp"."tweets_2963358137_account_id_idx";

drop index if exists "temp"."tweets_2963358137_account_id_retweet_count_idx";

drop index if exists "temp"."tweets_2963358137_archive_upload_id_idx";

drop index if exists "temp"."tweets_2963358137_created_at_idx";

drop index if exists "temp"."tweets_2963358137_created_at_idx1";

drop index if exists "temp"."tweets_2963358137_created_at_idx2";

drop index if exists "temp"."tweets_2963358137_created_at_idx3";

drop index if exists "temp"."tweets_2963358137_favorite_count_idx";

drop index if exists "temp"."tweets_2963358137_fts_idx";

drop index if exists "temp"."tweets_2963358137_pkey";

drop index if exists "temp"."tweets_2963358137_reply_to_tweet_id_idx";

drop index if exists "temp"."tweets_2963358137_reply_to_user_id_idx";

drop index if exists "temp"."tweets_2963358137_updated_at_idx";

drop index if exists "temp"."tweets_2963358137_updated_at_idx1";

drop index if exists "temp"."tweets_2963358137_updated_at_tweet_id_idx";

drop index if exists "temp"."user_mentions_1360327512031711237_mentioned_user_id_idx";

drop index if exists "temp"."user_mentions_1360327512031711237_pkey";

drop index if exists "temp"."user_mentions_1360327512031711237_tweet_id_idx";

drop index if exists "temp"."user_mentions_1360327512031711237_tweet_id_idx1";

drop index if exists "temp"."user_mentions_136032751203171123_mentioned_user_id_tweet_id_key";

drop index if exists "temp"."user_mentions_19068614_mentioned_user_id_idx";

drop index if exists "temp"."user_mentions_19068614_mentioned_user_id_tweet_id_key";

drop index if exists "temp"."user_mentions_19068614_pkey";

drop index if exists "temp"."user_mentions_19068614_tweet_id_idx";

drop index if exists "temp"."user_mentions_19068614_tweet_id_idx1";

drop index if exists "temp"."user_mentions_2963358137_mentioned_user_id_idx";

drop index if exists "temp"."user_mentions_2963358137_mentioned_user_id_tweet_id_key";

drop index if exists "temp"."user_mentions_2963358137_pkey";

drop index if exists "temp"."user_mentions_2963358137_tweet_id_idx";

drop index if exists "temp"."user_mentions_2963358137_tweet_id_idx1";

drop table "temp"."account_1360327512031711237";

drop table "temp"."account_19068614";

drop table "temp"."account_2963358137";

drop table "temp"."archive_upload_1360327512031711237";

drop table "temp"."archive_upload_19068614";

drop table "temp"."archive_upload_2963358137";

drop table "temp"."followers_1360327512031711237";

drop table "temp"."followers_19068614";

drop table "temp"."followers_2963358137";

drop table "temp"."following_1360327512031711237";

drop table "temp"."following_19068614";

drop table "temp"."following_2963358137";

drop table "temp"."liked_tweets_1360327512031711237";

drop table "temp"."liked_tweets_19068614";

drop table "temp"."liked_tweets_2963358137";

drop table "temp"."likes_1360327512031711237";

drop table "temp"."likes_19068614";

drop table "temp"."likes_2963358137";

drop table "temp"."mentioned_users_1360327512031711237";

drop table "temp"."mentioned_users_19068614";

drop table "temp"."mentioned_users_2963358137";

drop table "temp"."profile_1360327512031711237";

drop table "temp"."profile_19068614";

drop table "temp"."profile_2963358137";

drop table "temp"."tweet_media_1360327512031711237";

drop table "temp"."tweet_media_19068614";

drop table "temp"."tweet_media_2963358137";

drop table "temp"."tweet_urls_1360327512031711237";

drop table "temp"."tweet_urls_19068614";

drop table "temp"."tweet_urls_2963358137";

drop table "temp"."tweets_1360327512031711237";

drop table "temp"."tweets_19068614";

drop table "temp"."tweets_2963358137";

drop table "temp"."user_mentions_1360327512031711237";

drop table "temp"."user_mentions_19068614";

drop table "temp"."user_mentions_2963358137";


