export const MAX_MAP_USERNAMES = 20

export function parseMapUsernames(value: string): string[] | null {
  const names = value
    .split(',')
    .map((name) => name.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean)
  if (
    !names.length ||
    names.length > MAX_MAP_USERNAMES ||
    names.some((name) => !/^\w{1,15}$/.test(name))
  )
    return null
  return Array.from(new Set(names))
}
