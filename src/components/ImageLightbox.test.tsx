import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImageLightbox from './ImageLightbox'

test('dismisses the lightbox from the backdrop without activating its parent card', async () => {
  const user = userEvent.setup()
  const openCard = jest.fn()
  render(
    <div onClick={openCard}>
      <ImageLightbox src="/test-image.png" alt="Tweet photo" />
    </div>,
  )
  await user.click(screen.getByRole('button', { name: 'Enlarge tweet photo' }))
  const dialog = screen.getByRole('dialog')
  await user.click(within(dialog).getByRole('img'))
  expect(dialog).toBeInTheDocument()
  expect(openCard).not.toHaveBeenCalled()

  // Radix renders the overlay immediately before its portaled dialog content.
  const backdrop = dialog.previousElementSibling!
  await user.click(backdrop)
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  expect(openCard).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Enlarge tweet photo' }))
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
