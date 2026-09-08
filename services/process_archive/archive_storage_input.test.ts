import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { parseArchiveInput } from './archive_storage_input'
import { archiveStoragePath } from './archive_storage_reference'

const path = 'fixture_owner/12345678-1234-1234-1234-123456789abc/archive.json'
const original = JSON.stringify({
  account: [{ account: { accountId: '123' } }],
  tweets: [{ id: '1', text: 'original' }],
})
const reference = {
  storage_path: path,
  storage_sha256: createHash('sha256').update(original).digest('hex'),
  account_id: '123',
}

test('retry resolves the pinned upload, while legacy rows keep their original path', () => {
  assert.equal(archiveStoragePath('Fixture_Owner', reference), path)
  assert.equal(
    archiveStoragePath('fixture_owner'),
    'fixture_owner/archive.json',
  )
  assert.deepEqual(parseArchiveInput(original, reference), JSON.parse(original))
})
test('same tweet IDs with changed bytes fail before normalization', () => {
  assert.throws(
    () =>
      parseArchiveInput(original.replace('original', 'modified'), reference),
    /checksum mismatch/,
  )
})
test('invalid, cross-owner and partial references never fall back to a mutable object', () => {
  assert.throws(
    () => archiveStoragePath('other_owner', reference),
    /Invalid immutable/,
  )
  assert.throws(
    () => archiveStoragePath('fixture_owner', { storage_path: path }),
    /Invalid immutable/,
  )
  assert.throws(
    () =>
      archiveStoragePath('fixture_owner', {
        ...reference,
        storage_path: '../archive.json',
      }),
    /Invalid immutable/,
  )
  assert.throws(
    () => parseArchiveInput(original, { ...reference, account_id: '456' }),
    /owner does not match/,
  )
})
