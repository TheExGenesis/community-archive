import { formatNumber } from './formatNumber'

it.each([
  [null, '0'],
  [undefined, '0'],
  [0, '0'],
  [999, '999'],
  [1_000, '1.0K'],
  [1_650, '1.6K'],
  [1_699, '1.6K'],
  [1_700, '1.7K'],
  [999_999, '999.9K'],
  [1_000_000, '1.0M'],
  [1_699_999, '1.6M'],
  [1_700_000, '1.7M'],
])('floors %s to the reached display increment: %s', (value, expected) => {
  expect(formatNumber(value, 'floor')).toBe(expected)
})

it('preserves nearest rounding for existing callers', () => {
  expect(formatNumber(1_660)).toBe('1.7K')
  expect(formatNumber(1_660_000)).toBe('1.7M')
})
