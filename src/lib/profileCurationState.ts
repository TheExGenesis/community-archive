export type ProfileCurationSection = 'bangers' | 'people'

export interface ProfileCurationRow {
  item_id: string
  is_hidden: boolean
  is_featured: boolean
  position: number | null
}

export interface ProfileCurationMetadata {
  is_featured: boolean
  position: number | null
}

export type ProfileCuratedItem<T> = T & {
  curation?: ProfileCurationMetadata
}

/** Apply sparse owner overrides without changing the generated source data. */
export function applyProfileCuration<T>(
  items: T[],
  rows: ProfileCurationRow[],
  getItemId: (item: T) => string,
): ProfileCuratedItem<T>[] {
  if (rows.length === 0) return items as ProfileCuratedItem<T>[]

  const overrides = new Map(rows.map((row) => [row.item_id, row]))
  const sourceOrder = new Map(
    items.map((item, index) => [getItemId(item), index]),
  )

  return items
    .filter((item) => !overrides.get(getItemId(item))?.is_hidden)
    .map((item) => {
      const override = overrides.get(getItemId(item))
      if (!override) return item
      return {
        ...item,
        curation: {
          is_featured: override.is_featured,
          position: override.position,
        },
      }
    })
    .sort((left, right) => {
      const leftId = getItemId(left)
      const rightId = getItemId(right)
      const leftOverride = overrides.get(leftId)
      const rightOverride = overrides.get(rightId)

      const featureDifference =
        Number(rightOverride?.is_featured ?? false) -
        Number(leftOverride?.is_featured ?? false)
      if (featureDifference !== 0) return featureDifference

      const leftPosition = leftOverride?.position
      const rightPosition = rightOverride?.position
      if (leftPosition !== null && leftPosition !== undefined) {
        if (rightPosition === null || rightPosition === undefined) return -1
        if (leftPosition !== rightPosition) return leftPosition - rightPosition
      } else if (rightPosition !== null && rightPosition !== undefined) {
        return 1
      }

      return (sourceOrder.get(leftId) ?? 0) - (sourceOrder.get(rightId) ?? 0)
    }) as ProfileCuratedItem<T>[]
}
