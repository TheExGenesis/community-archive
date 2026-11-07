/**
 * What a profile's "stats" band reads: each account's top themes per calendar
 * year (UTC) and across all time. Written offline by scripts/generate-profile-themes.ts into
 * generatedThemes.json and served by themeConfig.ts; the model is never
 * called at request time. Types only, so client components can import it.
 */

export interface ProfileTheme {
  /** 1-4 lowercase words naming a specific subject, e.g. "close friendship". */
  label: string
  /** One plain, concrete line, at most 90 characters. */
  description: string
  /** Posts in the period matching any of the theme's keywords. */
  postCount: number
  /** The lowercase keywords/phrases that matched posts for postCount. */
  keywords: string[]
  /** 1-3 ids of real posts from the period that exemplify the theme. */
  exampleTweetIds: string[]
}

export interface ProfileYearThemes {
  /** The UTC calendar year, or null for all time (every post they have). */
  year: number | null
  /** Posts considered in the period: the denominator for shares. */
  totalPosts: number
  /** Up to 5, sorted by postCount descending. */
  themes: ProfileTheme[]
}

export type ProfileThemesByYear = Record<number, ProfileYearThemes>

/**
 * Shape of generatedThemes.json: account id -> "<year>" | "all" -> themes.
 */
export type GeneratedThemesFile = Record<
  string,
  Record<string, ProfileYearThemes>
>
