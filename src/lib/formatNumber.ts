export const formatNumber = (
  num: number | null | undefined,
  rounding: 'nearest' | 'floor' = 'nearest',
): string => {
  if (num == null) return '0'
  const unit = num >= 1000000 ? 1000000 : num >= 1000 ? 1000 : null
  if (unit == null) return num.toString()
  // Floor in whole display increments before scaling to avoid decimal drift.
  const value =
    rounding === 'floor' ? Math.floor(num / (unit / 10)) / 10 : num / unit
  return value.toFixed(1) + (unit === 1000000 ? 'M' : 'K')
}
