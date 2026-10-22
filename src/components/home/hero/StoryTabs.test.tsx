import { fireEvent, render, screen } from '@testing-library/react'
import StoryTabs from './StoryTabs'

it('switches panels in place and supports keyboard tab navigation', () => {
  render(
    <StoryTabs
      digest={<a href="/digest">Digest story</a>}
      strands={<a href="/strands/123">Strand story</a>}
    />,
  )
  expect(screen.getByRole('link', { name: 'Digest story' })).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Strand story' })).toBeNull()
  const strandsTab = screen.getByRole('tab', { name: 'Strands' })
  fireEvent.click(strandsTab)
  expect(strandsTab).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('link', { name: 'Strand story' })).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Digest story' })).toBeNull()
  fireEvent.keyDown(strandsTab, { key: 'ArrowLeft' })
  expect(screen.getByRole('tab', { name: 'Digest' })).toHaveFocus()
  expect(screen.getByRole('link', { name: 'Digest story' })).toBeVisible()
})
