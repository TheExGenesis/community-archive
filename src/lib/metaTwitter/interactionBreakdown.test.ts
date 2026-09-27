import { interactionBreakdown } from './interactionBreakdown'
import type { ArchivePerson } from './types'

test('classifies a profile interaction total by type', () => {
  const person: ArchivePerson = {
    user_id: '7',
    screen_name: 'bob',
    name: 'Bob',
    interactions: 9,
    interaction_counts: {
      mentions: 2,
      replies: 3,
      quotes: 1,
      reposts: 3,
    },
  }

  expect(interactionBreakdown(person)).toBe(
    '9 total · 3 replies · 2 mentions · 1 quote · 3 reposts',
  )
})

test('keeps the legacy total when classified counts are unavailable', () => {
  expect(
    interactionBreakdown({
      user_id: '7',
      screen_name: 'bob',
      name: 'Bob',
      interactions: 1,
    }),
  ).toBe('1 interaction')
})
