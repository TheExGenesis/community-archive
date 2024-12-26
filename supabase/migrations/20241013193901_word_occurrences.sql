-- Supabase AI is experimental and may produce incorrect answers
-- Always verify the output before executing

DROP FUNCTION IF EXISTS public.word_occurrences (
  TEXT,
  TIMESTAMP WITH TIME ZONE,
  TIMESTAMP WITH TIME ZONE,
  TEXT[]
);
CREATE
OR REPLACE FUNCTION public.word_occurrences (
  search_word TEXT,
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  user_ids TEXT[] DEFAULT NULL
) RETURNS TABLE (MONTH TEXT, word_count bigint) AS $$
BEGIN
    RETURN QUERY
    SELECT
        to_char(t.created_at, 'YYYY-MM') AS month,
        COUNT(*) AS word_count
    FROM
        public.tweets t
    WHERE
        t.full_text ILIKE '%' || search_word || '%'  -- Search for the specified word
        AND (t.created_at BETWEEN start_date AND end_date OR start_date IS NULL OR end_date IS NULL)  -- Date range filtering
        AND (t.account_id = ANY(user_ids) OR user_ids IS NULL)  -- User filtering
    GROUP BY
        month
    ORDER BY
        month;
END;
$$ LANGUAGE plpgsql;
