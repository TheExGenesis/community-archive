-- Private member shelves: facts, derived items and owner curation (see services/shelf).

-- Private member shelves (works a member engaged with, derived from their own tweets)
CREATE SCHEMA shelf;

-- Shelf: facts about the works and tools a member engaged with, derived from their own
-- tweets by services/shelf. mentions and answers are append-only facts; items is the
-- derived shelf the worker rebuilds per account; curation holds the owner's decisions,
-- which survive rebuilds because they key on work_key.
CREATE TABLE shelf.runs (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  accounts text[] NOT NULL CHECK (cardinality(accounts) BETWEEN 1 AND 10),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed','budget')),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE shelf.calls (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  run_id bigint REFERENCES shelf.runs(id),
  provider text NOT NULL CHECK (provider IN ('typesafe','openai','openrouter')),
  model text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('gate','name','stance')),
  reserved_usd numeric(12,8) NOT NULL CHECK (reserved_usd >= 0),
  actual_usd numeric(12,8) CHECK (actual_usd >= 0),
  status text NOT NULL DEFAULT 'reserved'
);
CREATE INDEX shelf_calls_created_idx ON shelf.calls(created_at);

CREATE TABLE shelf.mentions (
  id text PRIMARY KEY CHECK (id ~ '^mention:[0-9a-f]{12}$'),
  account_id text NOT NULL CHECK (account_id ~ '^[0-9]{1,20}$'),
  tweet_id text NOT NULL CHECK (tweet_id ~ '^[0-9]{1,20}$'),
  surface text NOT NULL,
  identity text NOT NULL CHECK (identity IN ('named','url','unnamed')),
  name text NOT NULL,
  creator text,
  kind text NOT NULL,
  namer text NOT NULL,
  verbatim boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shelf_mentions_account_idx ON shelf.mentions(account_id);

-- One row per tweet the namer processed, so tweets with no mentions are not re-sent.
CREATE TABLE shelf.named_tweets (
  tweet_id text NOT NULL CHECK (tweet_id ~ '^[0-9]{1,20}$'),
  namer text NOT NULL,
  account_id text NOT NULL CHECK (account_id ~ '^[0-9]{1,20}$'),
  mention_count integer NOT NULL CHECK (mention_count >= 0),
  cost_usd numeric(12,10),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tweet_id, namer)
);

-- Classifier answers. Questions are versioned (gate@1, warm@1); a reworded question is a
-- new version, so answers are never updated.
CREATE TABLE shelf.answers (
  subject text NOT NULL CHECK (subject ~ '^(tweet:[0-9]{1,20}|mention:[0-9a-f]{12})$'),
  question text NOT NULL CHECK (question ~ '^[a-z_]+@[0-9]+$'),
  model text NOT NULL,
  account_id text NOT NULL CHECK (account_id ~ '^[0-9]{1,20}$'),
  p real CHECK (p BETWEEN 0 AND 1),
  probs jsonb,
  refusal boolean NOT NULL DEFAULT false,
  cost_usd numeric(12,10),
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject, question, model),
  CHECK (refusal OR p IS NOT NULL OR probs IS NOT NULL)
);
CREATE INDEX shelf_answers_account_idx ON shelf.answers(account_id);

CREATE TABLE shelf.items (
  account_id text NOT NULL CHECK (account_id ~ '^[0-9]{1,20}$'),
  work_key text NOT NULL CHECK (length(work_key) BETWEEN 3 AND 300),
  shelf_row text NOT NULL CHECK (shelf_row IN
    ('books','reading','watching','listening','playing','tools','other','made','links','mentioned')),
  medium text NOT NULL,
  label text NOT NULL,
  needs_title boolean NOT NULL,
  creator text,
  url text,
  marks text[] NOT NULL DEFAULT '{}' CHECK (marks <@ ARRAY['loved','recommended','disliked']),
  evidence_tweet_ids text[] NOT NULL CHECK (cardinality(evidence_tweet_ids) >= 1),
  first_at timestamptz NOT NULL,
  last_at timestamptz NOT NULL,
  image_url text,
  image_source text,
  -- Fingerprint of what the public sees (row, label, creator, url, marks). An approval is
  -- tied to it, so an approved item that changes goes back to the owner for review.
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, work_key)
);

-- Resolved titles and images, shared across accounts so a work is looked up once.
-- key is a medium-scoped identity such as youtube:<id>, book:<title>|<creator> or url:<canonical>.
CREATE TABLE shelf.resolutions (
  key text PRIMARY KEY CHECK (length(key) BETWEEN 3 AND 400),
  title text,
  image_url text CHECK (image_url IS NULL OR image_url ~ '^https://'),
  source text NOT NULL,
  found boolean NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now()
);

-- t.co short links seen in tweet text whose expanded URL the archive did not record.
-- status is the HTTP status t.co returned; target is its Location header (a redirect).
CREATE TABLE shelf.short_links (
  code text PRIMARY KEY CHECK (code ~ '^[A-Za-z0-9]{4,20}$'),
  target text CHECK (target IS NULL OR length(target) <= 4000),
  status integer NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now()
);

-- Owner decisions. Nothing on a shelf is public until its owner approves it.
CREATE TABLE shelf.curation (
  account_id text NOT NULL CHECK (account_id ~ '^[0-9]{1,20}$'),
  work_key text NOT NULL CHECK (length(work_key) BETWEEN 3 AND 300),
  status text CHECK (status IN ('approved','hidden')),
  title text CHECK (title IS NULL OR length(title) BETWEEN 1 AND 200),
  approved_hash text CHECK (approved_hash IS NULL OR approved_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, work_key)
);

-- The shelf for one account, with the owner's curation applied. Public callers
-- (include_unapproved=false) see approved items whose content has not changed since the
-- approval; the owner sees everything, with status 'changed' for an approved item that
-- needs another look and 'hidden' items so they can be restored. Both require membership.
CREATE FUNCTION public.get_shelf(p_account_id text, include_unapproved boolean)
RETURNS TABLE (
  work_key text, shelf_row text, medium text, label text, needs_title boolean,
  creator text, url text, marks text[], evidence_tweet_ids text[],
  first_at timestamptz, last_at timestamptz, image_url text, image_source text,
  status text, computed_at timestamptz
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT i.work_key, i.shelf_row, i.medium, coalesce(c.title, i.label),
         i.needs_title AND c.title IS NULL, i.creator, i.url, i.marks,
         i.evidence_tweet_ids, i.first_at, i.last_at, i.image_url, i.image_source,
         CASE WHEN c.status='approved' AND c.approved_hash IS DISTINCT FROM i.content_hash
              THEN 'changed' ELSE coalesce(c.status, 'pending') END, i.computed_at
  FROM shelf.items i
  LEFT JOIN shelf.curation c ON c.account_id=i.account_id AND c.work_key=i.work_key
  WHERE i.account_id=p_account_id
    AND EXISTS (SELECT 1 FROM bulletin.allowed_accounts a WHERE a.account_id=p_account_id)
    AND (include_unapproved OR (c.status='approved' AND c.approved_hash=i.content_hash))
  ORDER BY i.shelf_row, cardinality(i.evidence_tweet_ids) DESC, i.last_at DESC
  LIMIT 2000
$$;

-- Owner curation. status NULL clears the decision (back to pending); title NULL keeps
-- the generated label. The caller must have verified the session owns the account.
CREATE FUNCTION public.set_shelf_curation(p_account_id text, p_work_keys text[], p_status text, p_title text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer;
BEGIN
  IF p_account_id IS NULL OR p_account_id !~ '^[0-9]{1,20}$'
     OR p_work_keys IS NULL OR cardinality(p_work_keys) NOT BETWEEN 1 AND 500
     OR (p_status IS NOT NULL AND p_status NOT IN ('approved','hidden'))
     OR (p_title IS NOT NULL AND cardinality(p_work_keys) <> 1) THEN
    RAISE EXCEPTION 'Invalid shelf curation' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM bulletin.allowed_accounts a WHERE a.account_id=p_account_id) THEN
    RAISE EXCEPTION 'Account is not a current member' USING ERRCODE='42501';
  END IF;
  INSERT INTO shelf.curation(account_id, work_key, status, title, approved_hash, updated_at)
    SELECT p_account_id, i.work_key, p_status, nullif(btrim(p_title),''),
           CASE WHEN p_status='approved' THEN i.content_hash END, now()
    FROM shelf.items i WHERE i.account_id=p_account_id AND i.work_key=ANY(p_work_keys)
  ON CONFLICT (account_id, work_key) DO UPDATE
    SET status=EXCLUDED.status,
        title=CASE WHEN p_title IS NULL THEN shelf.curation.title ELSE EXCLUDED.title END,
        approved_hash=EXCLUDED.approved_hash,
        updated_at=now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;

ALTER TABLE shelf.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf.mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf.named_tweets ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf.curation ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf.resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf.short_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA shelf FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA shelf FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA shelf FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA shelf TO service_role;
GRANT SELECT,INSERT,UPDATE ON shelf.runs TO service_role;
GRANT SELECT,INSERT,UPDATE ON shelf.calls TO service_role;
-- Facts are append-only.
GRANT SELECT,INSERT ON shelf.mentions,shelf.named_tweets,shelf.answers TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON shelf.items,shelf.curation,shelf.resolutions TO service_role;
GRANT SELECT,INSERT,UPDATE ON shelf.short_links TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA shelf TO service_role;
REVOKE ALL ON FUNCTION public.get_shelf(text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_shelf_curation(text,text[],text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_shelf(text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_shelf_curation(text,text[],text,text) TO service_role;
