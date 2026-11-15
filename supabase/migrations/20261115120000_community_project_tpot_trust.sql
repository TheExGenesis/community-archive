-- Every Gallery app is a database row. Tpot-Trust was the one curated entry
-- still only in code. It has no launch post, so its page stands as the source.
-- An existing row with the same slug wins.
INSERT INTO public.community_projects (
  slug,
  name,
  project_url,
  creator_name,
  creator_handle,
  category,
  description,
  archive_use,
  source_post_url,
  tags,
  submitter_username,
  status,
  featured,
  submitted_at,
  published_at,
  summary
)
VALUES (
  'tpot-trust',
  'Tpot-Trust',
  'https://tpot.uptrusthq.com/',
  'UpTrust HQ',
  NULL,
  'Experiments',
  'Choose a poster to see how their inferred trust changes the ranking of archived posts, or explore the community trust map.',
  'Uses likes, replies, and other interactions in a Community Archive snapshot to infer trust between posters and rank posts for each viewer.',
  'https://tpot.uptrusthq.com/',
  ARRAY['Trust', 'Personalized timelines', 'Social graph'],
  'backfill',
  'published',
  false,
  '2026-09-24T00:00:00Z',
  '2026-09-24T00:00:00Z',
  'Explore personalized timelines and a trust map of the tpot archive.'
)
ON CONFLICT (slug) DO NOTHING;
