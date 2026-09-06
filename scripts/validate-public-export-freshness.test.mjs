import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePublicExportFreshness } from './validate-public-export-freshness.mjs'
const now = Date.parse('2026-09-06T12:00:00Z')
const fresh = {
  created_at: '2026-09-06T07:00:00.000Z',
  consent_snapshot_at: '2026-09-06 07:12:00.000',
}
test('accepts fresh export and UTC consent timestamps', () => {
  assert.doesNotThrow(() => validatePublicExportFreshness(fresh, now))
})
test('rejects an old export even if its files remain downloadable', () => {
  assert.throws(
    () =>
      validatePublicExportFreshness(
        { ...fresh, created_at: '2026-09-01T07:00:00Z' },
        now,
      ),
    /freshness window/,
  )
})
test('rejects stale or missing consent and future metadata', () => {
  for (const consent_snapshot_at of [
    '2026-09-01 07:00:00',
    undefined,
    'invalid',
    '2026-09-07T07:00:00Z',
  ]) {
    assert.throws(() =>
      validatePublicExportFreshness({ ...fresh, consent_snapshot_at }, now),
    )
  }
})
