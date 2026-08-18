import { PROFILE_BADGE_LABELS, profileBadge } from './profileBadge'

const member = { has_archive: false, is_opted_in: false }

test('project contributors outrank every membership signal', () => {
  expect(
    profileBadge({ ...member, username: 'christineist', has_archive: true }),
  ).toBe('contributor')
  expect(profileBadge({ ...member, username: 'exgenesis' })).toBe('contributor')
})

test('past contributors keep the badge, case-insensitively', () => {
  expect(profileBadge({ ...member, username: 'DEFENDEROFBASIC' })).toBe(
    'contributor',
  )
})

test('an uploaded archive outranks a plain opt-in', () => {
  expect(
    profileBadge({
      username: 'stranger',
      has_archive: true,
      is_opted_in: true,
    }),
  ).toBe('archive')
})

test('opted-in accounts without an archive fall back to the opt-in badge', () => {
  expect(
    profileBadge({
      username: 'stranger',
      has_archive: false,
      is_opted_in: true,
    }),
  ).toBe('opted-in')
})

test('accounts with no membership signal get no badge', () => {
  expect(profileBadge({ ...member, username: 'stranger' })).toBeNull()
})

test('every badge state has a label', () => {
  expect(PROFILE_BADGE_LABELS.contributor).toBe('Archive contributor')
  expect(PROFILE_BADGE_LABELS.archive).toBe('Archive uploaded')
  expect(PROFILE_BADGE_LABELS['opted-in']).toBe('Opted in')
})
