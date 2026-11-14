import {
  ALL_TIME_KEY,
  GENERATED_THEMES,
  profileAllTimeThemes,
  profileThemesByYear,
} from '@/lib/metaTwitter/themeConfig'

const CHRISTINE = '826134955549790208'

test('serves themes only for generated accounts, keyed by year', () => {
  expect(profileThemesByYear('42')).toBeNull()
  const byYear = profileThemesByYear(CHRISTINE)!
  expect(byYear).not.toBeNull()
  for (const [year, entry] of Object.entries(byYear))
    expect(entry.year).toBe(Number(year))
  expect(profileAllTimeThemes('42')).toBeNull()
})

test('every generated year honors the stats band contract', () => {
  const years = Object.entries(GENERATED_THEMES).flatMap(([id, byYear]) =>
    Object.entries(byYear).map(([year, entry]) => ({ id, year, entry })),
  )
  expect(years.length).toBeGreaterThan(0)
  for (const { id, year, entry } of years) {
    expect(id).toMatch(/^\d{1,20}$/)
    expect(entry.year).toBe(year === ALL_TIME_KEY ? null : Number(year))
    expect(entry.totalPosts).toBeGreaterThanOrEqual(20)
    expect(entry.themes.length).toBeGreaterThan(0)
    expect(entry.themes.length).toBeLessThanOrEqual(5)
    const counts = entry.themes.map((theme) => theme.postCount)
    expect(counts).toEqual(counts.slice().sort((a, b) => b - a))
    for (const theme of entry.themes) {
      expect(theme.label).toBe(theme.label.toLowerCase())
      expect(theme.label.split(' ').length).toBeLessThanOrEqual(4)
      expect(theme.description.length).toBeGreaterThan(0)
      expect(theme.description.length).toBeLessThanOrEqual(90)
      expect(theme.postCount).toBeGreaterThan(0)
      expect(theme.postCount).toBeLessThanOrEqual(entry.totalPosts)
      expect(theme.keywords.length).toBeGreaterThan(0)
      for (const keyword of theme.keywords)
        expect(keyword).toBe(keyword.toLowerCase())
      expect(theme.exampleTweetIds.length).toBeGreaterThan(0)
      expect(theme.exampleTweetIds.length).toBeLessThanOrEqual(3)
      for (const tweetId of theme.exampleTweetIds)
        expect(tweetId).toMatch(/^\d{1,20}$/)
    }
  }
})
