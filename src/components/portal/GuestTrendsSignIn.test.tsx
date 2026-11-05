import { render, screen } from '@testing-library/react'
import GuestTrendsSignIn from './GuestTrendsSignIn'

test('carries the shared trends query through login', () => {
  window.history.replaceState(null, '', '/trends?q=ai&granularity=month')
  render(<GuestTrendsSignIn />)
  const href = screen
    .getByRole('link', { name: 'Log in to continue' })
    .getAttribute('href')!
  const redirect = new URL(href, 'https://archive.test').searchParams.get(
    'redirect',
  )
  expect(redirect).toBe('/trends?q=ai&granularity=month')
})
