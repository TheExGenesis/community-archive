import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { ProfileStats } from './ProfileStats'
import type { ProfileYearThemes } from '@/lib/metaTwitter/profileThemes'

const theme = (label: string, postCount: number) => ({
  label,
  description: `posts about ${label}`,
  postCount,
  keywords: [label],
  exampleTweetIds: ['1'],
})

const thisYear: ProfileYearThemes = {
  year: 2026,
  totalPosts: 200,
  themes: [theme('cuties app', 70), theme('climbing', 1)],
}

const allTime: ProfileYearThemes = {
  year: null,
  totalPosts: 1000,
  themes: [theme('hosting', 30)],
}

test('renders a card per period with shares of that period’s posts', () => {
  render(
    <ProfileStats displayName="christine" themeYears={[thisYear, allTime]} />,
  )
  expect(
    screen.getByRole('heading', { name: 'Top themes · 2026' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'Top themes · All time' }),
  ).toBeInTheDocument()
  expect(screen.getByText('35%')).toBeInTheDocument()
  expect(screen.getByText('<1%')).toBeInTheDocument()
  expect(screen.getByText('3%')).toBeInTheDocument()
  expect(screen.getByText('1,000 posts')).toBeInTheDocument()
})

test('renders nothing without themes', () => {
  const { container } = render(
    <ProfileStats
      displayName="christine"
      themeYears={[{ ...thisYear, themes: [] }]}
    />,
  )
  expect(container).toBeEmptyDOMElement()
})
