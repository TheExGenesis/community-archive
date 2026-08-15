-- Authenticated community members can leave one private feedback response per
-- published digest edition. Editors read aggregate/free-form feedback through the
-- service role; members can only read and edit their own row.

CREATE TABLE public.digest_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.digest_editions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sentiment text NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digest_feedback_edition_user_key UNIQUE (edition_id, user_id),
  CONSTRAINT digest_feedback_sentiment_check CHECK (sentiment IN ('helpful', 'not_helpful')),
  CONSTRAINT digest_feedback_comment_length CHECK (comment IS NULL OR char_length(comment) <= 2000)
);

ALTER TABLE public.digest_feedback OWNER TO postgres;
CREATE INDEX digest_feedback_edition_sentiment_idx
  ON public.digest_feedback (edition_id, sentiment);

ALTER TABLE public.digest_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own digest feedback"
  ON public.digest_feedback FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Members can insert own published digest feedback"
  ON public.digest_feedback FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.digest_editions edition
      WHERE edition.id = digest_feedback.edition_id
        AND edition.status = 'published'
    )
  );

CREATE POLICY "Members can update own published digest feedback"
  ON public.digest_feedback FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.digest_editions edition
      WHERE edition.id = digest_feedback.edition_id
        AND edition.status = 'published'
    )
  );

CREATE POLICY "Members can delete own digest feedback"
  ON public.digest_feedback FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE public.digest_feedback FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.digest_feedback TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.digest_feedback TO service_role;
