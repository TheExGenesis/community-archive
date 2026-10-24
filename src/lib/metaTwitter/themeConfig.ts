import 'server-only'

import generated from './generatedThemes.json'
import type {
  GeneratedThemesFile,
  ProfileThemesByYear,
  ProfileYearThemes,
} from './profileThemes'
export type { GeneratedThemesFile } from './profileThemes'

/**
 * Which accounts have yearly themes, and what they are. generatedThemes.json
 * is written offline by scripts/generate-profile-themes.ts; nothing here
 * calls a model. Server-only so the whole file never ships to the browser;
 * pass a single account's themes down as props.
 */

export const GENERATED_THEMES = generated as unknown as GeneratedThemesFile

export const ALL_TIME_KEY = 'all'

/** An account's themes keyed by year, or null when it has none. */
export const profileThemesByYear = (
  accountId: string,
): ProfileThemesByYear | null => {
  const years = Object.entries(GENERATED_THEMES[accountId] ?? {}).filter(
    ([key]) => key !== ALL_TIME_KEY,
  )
  if (!years.length) return null
  return Object.fromEntries(
    years.map(([year, entry]) => [Number(year), entry]),
  ) as ProfileThemesByYear
}

/** An account's all-time themes, or null when it has none. */
export const profileAllTimeThemes = (
  accountId: string,
): ProfileYearThemes | null =>
  GENERATED_THEMES[accountId]?.[ALL_TIME_KEY] ?? null
