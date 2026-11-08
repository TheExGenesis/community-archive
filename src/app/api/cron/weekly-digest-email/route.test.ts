import { weekAgeDays } from './route'

jest.mock('@/lib/email', () => ({ sendEmail: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))

test('measures how long ago a week ended', () => {
  const monday = Date.parse('2026-11-09T12:30:00Z')
  expect(weekAgeDays('2026-11-08', monday)).toBeLessThan(1)
  expect(weekAgeDays('2026-10-25', monday)).toBeGreaterThan(8)
})
