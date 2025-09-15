drop policy "Public read access" on "public"."conversations";

revoke select on table "public"."likes" from "readclient";

revoke select on table "public"."mentioned_users" from "readclient";


