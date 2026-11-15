import { weeklyThreadFromRows } from './comments'

describe('weeklyThreadFromRows', () => {
  const row = (id: string, status: string) => ({
    id,
    status,
    week_start: '2026-11-09',
  })

  test('reads every public edition of the week and writes to the running one', () => {
    expect(
      weeklyThreadFromRows([
        row('mon', 'archived'),
        row('tue', 'archived'),
        row('wed', 'in_progress'),
      ]),
    ).toEqual({
      editionIds: ['mon', 'tue', 'wed'],
      writeTo: 'wed',
      weekStart: '2026-11-09',
    })
  })

  test('writes to the final edition once the week is published', () => {
    expect(
      weeklyThreadFromRows([row('wed', 'archived'), row('final', 'published')]),
    ).toEqual({
      editionIds: ['wed', 'final'],
      writeTo: 'final',
      weekStart: '2026-11-09',
    })
  })

  test('has no thread when no edition of the week is open', () => {
    expect(weeklyThreadFromRows([row('wed', 'archived')])).toBeNull()
  })
})
