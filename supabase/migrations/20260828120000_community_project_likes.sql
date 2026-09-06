create table "public"."community_project_likes" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."community_project_likes" enable row level security;

CREATE UNIQUE INDEX community_project_likes_pkey ON public.community_project_likes USING btree (id);

CREATE UNIQUE INDEX community_project_likes_project_user_key ON public.community_project_likes USING btree (project_id, user_id);

CREATE INDEX community_project_likes_project_id_idx ON public.community_project_likes USING btree (project_id);

alter table "public"."community_project_likes" add constraint "community_project_likes_pkey" PRIMARY KEY using index "community_project_likes_pkey";

alter table "public"."community_project_likes" add constraint "community_project_likes_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.community_projects(id) ON DELETE CASCADE not valid;

alter table "public"."community_project_likes" validate constraint "community_project_likes_project_id_fkey";

alter table "public"."community_project_likes" add constraint "community_project_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."community_project_likes" validate constraint "community_project_likes_user_id_fkey";

alter table "public"."community_project_likes" add constraint "community_project_likes_project_user_key" UNIQUE using index "community_project_likes_project_user_key";

grant select on table "public"."community_project_likes" to "anon";

grant select on table "public"."community_project_likes" to "authenticated";

grant delete on table "public"."community_project_likes" to "service_role";

grant insert on table "public"."community_project_likes" to "service_role";

grant references on table "public"."community_project_likes" to "service_role";

grant select on table "public"."community_project_likes" to "service_role";

grant trigger on table "public"."community_project_likes" to "service_role";

grant truncate on table "public"."community_project_likes" to "service_role";

grant update on table "public"."community_project_likes" to "service_role";

create policy "Likes on published community projects are publicly readable"
on "public"."community_project_likes"
as permissive
for select
to anon, authenticated
using ((EXISTS ( SELECT 1
   FROM community_projects
  WHERE ((community_projects.id = community_project_likes.project_id) AND (community_projects.status = 'published'::text)))));
