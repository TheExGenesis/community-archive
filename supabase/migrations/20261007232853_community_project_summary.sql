-- Optional card headline for a Community Gallery project. When null, the
-- Gallery falls back to the curated summary or the description's first sentence.
ALTER TABLE public.community_projects
  ADD COLUMN summary text
  CONSTRAINT community_projects_summary_length
    CHECK (summary IS NULL OR char_length(summary) BETWEEN 1 AND 160);
