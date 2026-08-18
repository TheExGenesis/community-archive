import { MEMBERSHIP_BADGE_LABELS, membershipBadge } from './membershipBadge'

test('an uploaded archive outranks a plain opt-in', () => {
  expect(membershipBadge({ has_archive: true, is_opted_in: true })).toBe(
    'archive',
  )
  expect(membershipBadge({ has_archive: true, is_opted_in: false })).toBe(
    'archive',
  )
})

test('opted-in profiles without an archive fall back to the opt-in badge', () => {
  expect(membershipBadge({ has_archive: false, is_opted_in: true })).toBe(
    'opted-in',
  )
})

test('profiles with neither membership signal get no badge', () => {
  expect(membershipBadge({ has_archive: false, is_opted_in: false })).toBeNull()
})

test('every badge state has a label', () => {
  expect(MEMBERSHIP_BADGE_LABELS.archive).toBe('Archive uploaded')
  expect(MEMBERSHIP_BADGE_LABELS['opted-in']).toBe('Opted in')
})
