import { render, screen } from '@testing-library/react'
import {
  ProfileArchiveSkeleton,
  ProfilePageSkeleton,
} from './ProfilePageSkeleton'

test('renders an immediate full-page profile loading state', () => {
  render(<ProfilePageSkeleton />)
  expect(screen.getByLabelText('Loading profile archive')).toBeVisible()
})

test('renders the streamed archive fallback independently', () => {
  render(<ProfileArchiveSkeleton />)
  expect(screen.getByLabelText('Loading profile archive')).toBeVisible()
})
