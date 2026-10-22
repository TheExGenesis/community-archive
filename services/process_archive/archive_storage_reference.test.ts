import assert from 'node:assert/strict'
import test from 'node:test'
import type postgres from 'postgres'
import { lookupTrustedArchiveOwner } from './archive_owner'
import {
  ArchiveOwnerError,
  trustedArchiveStoragePath,
} from './archive_storage_reference'

const ownerPath = 'fixture_owner/12345678-1234-1234-1234-123456789abc/archive.json'
const otherPath = 'other_user/12345678-1234-1234-1234-123456789abc/archive.json'
const sha = 'b'.repeat(64)

const ownerError = (code: string) => (error: unknown) =>
  error instanceof ArchiveOwnerError && error.code === code

test('the folder comes from the trusted owner; the row username only has to match it', () => {
  assert.equal(
    trustedArchiveStoragePath(
      { account_id: '123', username: 'Fixture_Owner', storage_path: ownerPath, storage_sha256: sha },
      'fixture_owner',
    ),
    ownerPath,
  )
  // Legacy rows without a pinned reference keep `<owner>/archive.json`.
  assert.equal(
    trustedArchiveStoragePath({ account_id: '123', username: 'fixture_owner' }, 'Fixture_Owner'),
    'fixture_owner/archive.json',
  )
})

test('a row naming another handle is rejected before any path is built', () => {
  assert.throws(
    () =>
      trustedArchiveStoragePath(
        { account_id: '123', username: 'other_user', storage_path: otherPath, storage_sha256: sha },
        'fixture_owner',
      ),
    ownerError('archive_owner_mismatch'),
  )
  assert.throws(
    () => trustedArchiveStoragePath({ account_id: '123', username: 'other_user' }, 'fixture_owner'),
    ownerError('archive_owner_mismatch'),
  )
  assert.throws(
    () => trustedArchiveStoragePath({ account_id: '123', username: null }, 'fixture_owner'),
    ownerError('archive_owner_mismatch'),
  )
})

test("a matching username cannot point the pinned path into another user's folder", () => {
  assert.throws(
    () =>
      trustedArchiveStoragePath(
        { account_id: '123', username: 'fixture_owner', storage_path: otherPath, storage_sha256: sha },
        'fixture_owner',
      ),
    /Invalid immutable archive reference/,
  )
})

test('an account without a trusted handle fails closed', () => {
  for (const trusted of [null, undefined, '', '../etc', 'a'.repeat(16)]) {
    assert.throws(
      () => trustedArchiveStoragePath({ account_id: '123', username: 'fixture_owner' }, trusted),
      ownerError('archive_owner_unverified'),
    )
  }
})

function fakeSql(rows: Record<string, unknown>[]) {
  const calls: { text: string; values: unknown[] }[] = []
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('$'), values })
    return Promise.resolve(rows)
  }
  return { sql: sql as unknown as postgres.Sql, calls }
}

test('the trusted owner is read from auth identities by account id, never from the upload row', async () => {
  const { sql, calls } = fakeSql([{ handle: 'Fixture_Owner' }])
  assert.equal(await lookupTrustedArchiveOwner(sql, '123'), 'Fixture_Owner')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].values, ['123', '123'])
  assert.match(calls[0].text, /FROM auth\.identities AS i/)
  assert.match(calls[0].text, /i\.provider IN \('twitter', 'x'\)/)
  assert.match(calls[0].text, /raw_app_meta_data->>'user_name'/)
  assert.doesNotMatch(calls[0].text, /archive_upload|all_account|raw_user_meta_data/)

  assert.equal(await lookupTrustedArchiveOwner(fakeSql([]).sql, '123'), null)
})
