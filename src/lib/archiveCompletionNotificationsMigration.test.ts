import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260815094500_add_archive_completion_notifications.sql',
  ),
  'utf8',
)

describe('archive completion notification migration contract', () => {
  it('keeps the recipient owner-controlled and the outbox service-only', () => {
    expect(migration).toContain('u.email_confirmed_at')
    expect(migration).toContain("u.raw_app_meta_data->>'provider_id'")
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public.archive_completion_notification_outbox',
    )
    expect(migration).toContain(
      'GRANT SELECT ON TABLE public.archive_completion_notification_preferences TO authenticated',
    )
    expect(migration).toContain('USING (user_id = auth.uid())')
  })

  it('queues only completed opted-in uploads and honors deletion', () => {
    expect(migration).toContain("NEW.upload_phase = 'completed'")
    expect(migration).toContain('AND enabled IS TRUE')
    expect(migration).toContain('ON CONFLICT (archive_upload_id) DO NOTHING')
    expect(migration).toMatch(
      /archive_upload_id bigint NOT NULL UNIQUE\s+REFERENCES public\.archive_upload\(id\) ON DELETE CASCADE/,
    )
    expect(migration).toContain("status = 'cancelled'")
  })

  it('claims concurrently, recovers abandoned work, and caps retries', () => {
    expect(migration).toContain('FOR UPDATE SKIP LOCKED')
    expect(migration).toContain("locked_at < now() - interval '15 minutes'")
    expect(migration).toContain(
      "CASE WHEN attempt_count >= 5 THEN 'dead' ELSE 'retry' END",
    )
    expect(migration).toContain('LEFT(p_error, 2000)')
  })

  it('records a scheduler heartbeat even when there is no mail to send', () => {
    expect(migration).toContain(
      'INSERT INTO public.archive_completion_notification_worker_state',
    )
    expect(migration).toContain(
      'public.finish_archive_completion_notification_run',
    )
    expect(migration).toContain('worker_last_finished_timestamp_seconds')
    expect(migration).toContain('TO archive_metrics_exporter')
  })
})
