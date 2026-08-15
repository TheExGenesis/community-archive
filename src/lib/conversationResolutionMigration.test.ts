import fs from 'fs'
import path from 'path'

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260815033000_add_conversation_resolution_pipeline.sql',
  ),
  'utf8',
)

test('queues every new tweet without launching a historical backfill', () => {
  expect(migration).toContain(
    'AFTER INSERT OR UPDATE OF reply_to_tweet_id ON public.tweets',
  )
  expect(migration).toContain(
    "CASE WHEN v_is_root THEN 'root' ELSE 'pending' END",
  )
  expect(migration).not.toContain(
    'INSERT INTO public.conversations (tweet_id, conversation_id)\nSELECT',
  )
  expect(migration).not.toContain(
    "cron.schedule(\n      'reconcile-conversations-historical'",
  )
})

test('keeps historical reconciliation bounded, resumable, and operator-gated', () => {
  expect(migration).toContain('conversation_resolution_reconciliation')
  expect(migration).toContain('high_watermark_tweet_id')
  expect(migration).toContain('cursor_tweet_id')
  expect(migration).toContain('p_dry_run boolean DEFAULT false')
  expect(migration).toContain('LIMIT p_limit')
  expect(migration).toContain("v_state.status <> 'running'")
  expect(migration).toContain(
    "status = CASE WHEN p_run THEN 'running' ELSE 'paused' END",
  )
})

test('processes a bounded resumable batch with retries and telemetry', () => {
  expect(migration).toContain('p_limit integer DEFAULT 500')
  expect(migration).toContain('FOR UPDATE OF c SKIP LOCKED')
  expect(migration).toContain("THEN 'inherited'")
  expect(migration).toContain('attempt_count = child.attempt_count + 1')
  expect(migration).toContain('conversation_resolution_runs')
  expect(migration).toContain('conversation_resolution_health')
  expect(migration).toContain('GROUP BY producer_source, resolution_status')
  expect(migration).toContain(
    'private.community_archive_monitoring_conversation_resolution_health()',
  )
  expect(migration).toContain(
    'private.community_archive_monitoring_conversation_resolution_worker()',
  )
  expect(migration).toContain('conversation_resolution_coverage_snapshots')
  expect(migration).toContain("'17 4 * * *'")
  expect(migration).toContain("'* * * * *'")
})

test('preserves authoritative producer metadata over inferred rows', () => {
  expect(migration).toContain(
    "public.conversations.resolution_status = 'authoritative'",
  )
  expect(migration).toContain('THEN public.conversations.conversation_id')
})
