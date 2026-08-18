import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('authenticated write policy contract', () => {
  const policies = read('supabase/schemas/060_policies.sql')
  const grants = read('supabase/schemas/060_grants.sql')
  const migration = read(
    'supabase/migrations/20260817190000_remove_unused_authenticated_write_policies.sql',
  )

  test('keeps only browser write policies used by current direct clients', () => {
    expect(policies).toContain(
      '"Data is modifiable by their users" ON "public"."all_account"',
    )
    expect(policies).toContain(
      '"Data is modifiable by their users" ON "public"."archive_upload"',
    )
    expect(policies).toContain('"Users can insert own action log"')
    expect(policies).toContain('"Users can upload their own archive"')

    for (const policy of [
      'Entities are modifiable by their users',
      'Users can create own opt-in record',
      'Users can update own opt-in status',
      'Owners can insert profile settings',
      'Owners can update profile settings',
      'Owners can insert profile curation',
      'Owners can update profile curation',
      'Owners can delete profile curation',
    ]) {
      expect(policies).not.toContain(`CREATE POLICY "${policy}"`)
    }

    for (const table of [
      'all_profile',
      'followers',
      'following',
      'likes',
      'tweets',
    ]) {
      expect(policies).not.toContain(
        `"Data is modifiable by their users" ON "public"."${table}"`,
      )
    }
  })

  test('migration drops all fifteen unused policies and revokes table writes', () => {
    expect((migration.match(/DROP POLICY IF EXISTS/g) ?? []).length).toBe(15)
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE',
    )
    expect(migration).toContain('public.profile_curation\nFROM anon, authenticated;')
    expect(grants).not.toContain(
      'GRANT INSERT, UPDATE ON TABLE "public"."profile_settings"',
    )
    expect(grants).not.toContain(
      'GRANT INSERT, UPDATE, DELETE ON TABLE "public"."profile_curation"',
    )
  })
})
