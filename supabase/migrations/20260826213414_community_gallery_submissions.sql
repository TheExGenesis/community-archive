create table "public"."community_projects" (
    "id" uuid not null default gen_random_uuid(),
    "slug" text not null,
    "name" text not null,
    "project_url" text not null,
    "creator_name" text not null,
    "creator_handle" text,
    "category" text not null,
    "description" text not null,
    "archive_use" text not null,
    "source_post_url" text not null,
    "tags" text[] not null default ARRAY[]::text[],
    "cover_storage_path" text,
    "cover_mime_type" text,
    "submitted_by" uuid,
    "submitter_username" text not null,
    "status" text not null default 'pending'::text,
    "featured" boolean not null default false,
    "submitted_at" timestamp with time zone not null default now(),
    "published_by" uuid,
    "published_at" timestamp with time zone
);


alter table "public"."community_projects" enable row level security;

CREATE UNIQUE INDEX community_projects_pkey ON public.community_projects USING btree (id);

CREATE UNIQUE INDEX community_projects_slug_key ON public.community_projects USING btree (slug);

CREATE INDEX community_projects_status_submitted_at_idx ON public.community_projects USING btree (status, submitted_at DESC);

alter table "public"."community_projects" add constraint "community_projects_pkey" PRIMARY KEY using index "community_projects_pkey";

alter table "public"."community_projects" add constraint "community_projects_archive_use_length" CHECK (((char_length(archive_use) >= 1) AND (char_length(archive_use) <= 500))) not valid;

alter table "public"."community_projects" validate constraint "community_projects_archive_use_length";

alter table "public"."community_projects" add constraint "community_projects_category_check" CHECK ((category = ANY (ARRAY['Tools'::text, 'Experiments'::text, 'Research'::text, 'Games'::text]))) not valid;

alter table "public"."community_projects" validate constraint "community_projects_category_check";

alter table "public"."community_projects" add constraint "community_projects_cover_mime" CHECK (((cover_mime_type IS NULL) OR (cover_mime_type = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text])))) not valid;

alter table "public"."community_projects" validate constraint "community_projects_cover_mime";

alter table "public"."community_projects" add constraint "community_projects_cover_pair" CHECK (((cover_storage_path IS NULL) = (cover_mime_type IS NULL))) not valid;

alter table "public"."community_projects" validate constraint "community_projects_cover_pair";

alter table "public"."community_projects" add constraint "community_projects_creator_handle_length" CHECK (((creator_handle IS NULL) OR ((char_length(creator_handle) >= 1) AND (char_length(creator_handle) <= 80)))) not valid;

alter table "public"."community_projects" validate constraint "community_projects_creator_handle_length";

alter table "public"."community_projects" add constraint "community_projects_creator_name_length" CHECK (((char_length(creator_name) >= 1) AND (char_length(creator_name) <= 120))) not valid;

alter table "public"."community_projects" validate constraint "community_projects_creator_name_length";

alter table "public"."community_projects" add constraint "community_projects_description_length" CHECK (((char_length(description) >= 1) AND (char_length(description) <= 360))) not valid;

alter table "public"."community_projects" validate constraint "community_projects_description_length";

alter table "public"."community_projects" add constraint "community_projects_name_length" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))) not valid;

alter table "public"."community_projects" validate constraint "community_projects_name_length";

alter table "public"."community_projects" add constraint "community_projects_publication_state" CHECK ((((status = 'published'::text) AND (published_at IS NOT NULL)) OR ((status = 'pending'::text) AND (published_at IS NULL) AND (published_by IS NULL)))) not valid;

alter table "public"."community_projects" validate constraint "community_projects_publication_state";

alter table "public"."community_projects" add constraint "community_projects_published_by_fkey" FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."community_projects" validate constraint "community_projects_published_by_fkey";

alter table "public"."community_projects" add constraint "community_projects_slug_key" UNIQUE using index "community_projects_slug_key";

alter table "public"."community_projects" add constraint "community_projects_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'published'::text]))) not valid;

alter table "public"."community_projects" validate constraint "community_projects_status_check";

alter table "public"."community_projects" add constraint "community_projects_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."community_projects" validate constraint "community_projects_submitted_by_fkey";

alter table "public"."community_projects" add constraint "community_projects_tags_count" CHECK ((cardinality(tags) <= 8)) not valid;

alter table "public"."community_projects" validate constraint "community_projects_tags_count";

grant select on table "public"."community_projects" to "anon";

grant select on table "public"."community_projects" to "authenticated";

grant delete on table "public"."community_projects" to "service_role";

grant insert on table "public"."community_projects" to "service_role";

grant references on table "public"."community_projects" to "service_role";

grant select on table "public"."community_projects" to "service_role";

grant trigger on table "public"."community_projects" to "service_role";

grant truncate on table "public"."community_projects" to "service_role";

grant update on table "public"."community_projects" to "service_role";

create policy "Published community projects are publicly readable"
on "public"."community_projects"
as permissive
for select
to anon, authenticated
using ((status = 'published'::text));
