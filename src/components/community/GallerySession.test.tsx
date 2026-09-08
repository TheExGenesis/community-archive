import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GallerySession, GallerySessionValue } from './GallerySession'

test('public filtering works before session hydration and account actions unlock afterwards', async () => {
  const user = userEvent.setup()
  const { rerender } = render(
    <GallerySession projects={[]}>{null}</GallerySession>,
  )
  expect(
    screen.getByRole('button', { name: 'Submit a project' }),
  ).toBeDisabled()
  await user.type(
    screen.getByRole('searchbox', { name: 'Search community projects' }),
    'radio',
  )
  expect(screen.getByText('1 project')).toBeInTheDocument()
  rerender(
    <GallerySession projects={[]}>
      <GallerySessionValue
        session={{ isSignedIn: true, likedProjectIds: [] }}
      />
    </GallerySession>,
  )
  expect(screen.getByRole('button', { name: 'Submit a project' })).toBeEnabled()
  expect(screen.getByRole('searchbox')).toHaveValue('radio')
})
