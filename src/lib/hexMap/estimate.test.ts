import { estimateCell } from './estimate'

const cell = (x: number, y: number, region: number) => ({ x, y, region })
const snapshot = {
  cells: [
    cell(0, 0, 0),
    cell(1, 0, 0),
    cell(2, 0, 0),
    cell(10, 0, 1),
    cell(11, 0, 1),
  ],
} as unknown as Parameters<typeof estimateCell>[0]

it('returns null without mapped interactions', () => {
  expect(estimateCell(snapshot, [])).toBeNull()
  expect(
    estimateCell(snapshot, [{ cell: 99, interactions: 3, partners: 1 }]),
  ).toBeNull()
})
it('places one interaction in its partner cell', () => {
  expect(
    estimateCell(snapshot, [{ cell: 4, interactions: 1, partners: 1 }]),
  ).toEqual({
    cell: 4,
    interactions: 1,
    partners: 1,
  })
})
it('picks the strongest region and its cell nearest the weighted centre', () => {
  expect(
    estimateCell(snapshot, [
      { cell: 0, interactions: 3, partners: 1 },
      { cell: 2, interactions: 3, partners: 2 },
      { cell: 3, interactions: 5, partners: 1 },
    ]),
  ).toEqual({ cell: 1, interactions: 11, partners: 4 })
})
it('breaks interaction ties by partner count', () => {
  expect(
    estimateCell(snapshot, [
      { cell: 0, interactions: 4, partners: 1 },
      { cell: 4, interactions: 4, partners: 3 },
    ])?.cell,
  ).toBe(4)
})
