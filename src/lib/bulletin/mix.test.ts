import { mixOffersAndAsks } from './mix'

const ranked = (sides: string) =>
  sides.split('').map((c, i) => ({
    id: `${c}${i}`,
    side: c === 'o' ? 'offer' : 'ask',
  }))
const shape = (items: { side: string }[]) =>
  items.map((o) => (o.side === 'offer' ? 'o' : 'a')).join('')

test('leads with three offers, then keeps asks to about a third', () => {
  // Asks ranked first must not take the lead.
  const notices = ranked('aaaaoooooooo')
  expect(shape(mixOffersAndAsks(notices, 6))).toBe('oooaoa')
  expect(shape(mixOffersAndAsks(notices, 9))).toBe('oooaoaooa')
})

test('keeps each side in its ranked order', () => {
  const picked = mixOffersAndAsks(ranked('oaoaoaoa'), 6)
  expect(picked.map((o) => o.id)).toEqual(['o0', 'o2', 'o4', 'a1', 'o6', 'a3'])
})

test('fills from the other side when one runs out', () => {
  expect(shape(mixOffersAndAsks(ranked('oaaaaa'), 6))).toBe('oaaaaa')
  expect(shape(mixOffersAndAsks(ranked('oooooooo'), 6))).toBe('oooooo')
  expect(mixOffersAndAsks(ranked('oa'), 6)).toHaveLength(2)
})
