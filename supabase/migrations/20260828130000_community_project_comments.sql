create table "public"."community_project_comments" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid not null,
    "user_id" uuid not null,
    "content" text not null,
    "username" text,
    "display_name" text,
    "created_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
);


alter table "public"."community_project_comments" enable row level security;

CREATE UNIQUE INDEX community_project_comments_pkey ON public.community_project_comments USING btree (id);

CREATE INDEX community_project_comments_project_id_created_at_idx ON public.community_project_comments USING btree (project_id, created_at);

alter table "public"."community_project_comments" add constraint "community_project_comments_pkey" PRIMARY KEY using index "community_project_comments_pkey";

alter table "public"."community_project_comments" add constraint "community_project_comments_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.community_projects(id) ON DELETE CASCADE not valid;

alter table "public"."community_project_comments" validate constraint "community_project_comments_project_id_fkey";

alter table "public"."community_project_comments" add constraint "community_project_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."community_project_comments" validate constraint "community_project_comments_user_id_fkey";

alter table "public"."community_project_comments" add constraint "community_project_comments_content_length" CHECK ((char_length(content) >= 1) AND (char_length(content) <= 2000)) not valid;

alter table "public"."community_project_comments" validate constraint "community_project_comments_content_length";

grant select on table "public"."community_project_comments" to "anon";

grant select on table "public"."community_project_comments" to "authenticated";

grant delete on table "public"."community_project_comments" to "service_role";

grant insert on table "public"."community_project_comments" to "service_role";

grant references on table "public"."community_project_comments" to "service_role";

grant select on table "public"."community_project_comments" to "service_role";

grant trigger on table "public"."community_project_comments" to "service_role";

grant truncate on table "public"."community_project_comments" to "service_role";

grant update on table "public"."community_project_comments" to "service_role";

create policy "Comments on published community projects are publicly readable"
on "public"."community_project_comments"
as permissive
for select
to anon, authenticated
using ((EXISTS ( SELECT 1
   FROM community_projects
  WHERE ((community_projects.id = community_project_comments.project_id) AND (community_projects.status = 'published'::text)))));
