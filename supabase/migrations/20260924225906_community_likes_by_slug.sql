-- Preserve existing likes while allowing checked-in catalog projects to be
-- liked before they have a community_projects row.
ALTER TABLE public.community_project_likes
  ADD COLUMN project_slug text;

UPDATE public.community_project_likes AS likes
SET project_slug = projects.slug
FROM public.community_projects AS projects
WHERE likes.project_id = projects.id;

-- Keep the current UUID-based like API working until the new frontend is live
-- (and through a frontend rollback).
CREATE OR REPLACE FUNCTION public.fill_community_like_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.project_slug IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT slug INTO NEW.project_slug
    FROM public.community_projects
    WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fill_community_like_slug
BEFORE INSERT ON public.community_project_likes
FOR EACH ROW EXECUTE FUNCTION public.fill_community_like_slug();

ALTER TABLE public.community_project_likes
  ALTER COLUMN project_slug SET NOT NULL,
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE public.community_project_likes
  ADD CONSTRAINT community_project_likes_slug_user_key
  UNIQUE (project_slug, user_id);
