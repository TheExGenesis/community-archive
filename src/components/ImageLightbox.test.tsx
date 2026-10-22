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

const gallery = [1, 2, 3].map((n) => ({
  src: `/image-${n}.png`,
  alt: `Photo ${n}`,
  href: `/tweets/${n}`,
}))

const renderGallery = () =>
  render(
    <>
      {gallery.map((image, index) => (
        <ImageLightbox
          key={image.src}
          src={image.src}
          alt={image.alt}
          label={`Open media ${index + 1} of ${gallery.length}`}
          gallery={gallery}
          index={index}
        />
      ))}
    </>,
  )

test('steps through a gallery with arrow keys and buttons, stopping at the ends', async () => {
  const user = userEvent.setup()
  renderGallery()

  await user.click(screen.getByRole('button', { name: 'Open media 2 of 3' }))
  const dialog = screen.getByRole('dialog', { name: 'Photo 2' })
  expect(dialog).toHaveFocus()
  expect(within(dialog).getByText('2 / 3')).toBeVisible()
  expect(
    within(dialog).getByRole('link', { name: 'View post' }),
  ).toHaveAttribute('href', '/tweets/2')

  fireEvent.keyDown(dialog, { key: 'ArrowRight' })
  expect(screen.getByRole('dialog', { name: 'Photo 3' })).toBeInTheDocument()
  expect(within(dialog).getByText('Image 3 of 3')).toBeInTheDocument()
  expect(
    within(dialog).queryByRole('button', { name: 'Next image' }),
  ).not.toBeInTheDocument()
  fireEvent.keyDown(dialog, { key: 'ArrowRight' })
  expect(within(dialog).getByText('3 / 3')).toBeVisible()

  await user.click(
    within(dialog).getByRole('button', { name: 'Previous image' }),
  )
  fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
  expect(screen.getByRole('dialog', { name: 'Photo 1' })).toBeInTheDocument()
  expect(
    within(dialog).queryByRole('button', { name: 'Previous image' }),
  ).not.toBeInTheDocument()
  fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
  expect(within(dialog).getByText('1 / 3')).toBeVisible()
  // Modified arrows belong to the browser, not the gallery.
  fireEvent.keyDown(dialog, { key: 'ArrowRight', metaKey: true })
  expect(within(dialog).getByText('1 / 3')).toBeVisible()

  await user.keyboard('{ArrowRight}')
  expect(within(dialog).getByText('2 / 3')).toBeVisible()

  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  // Radix restores focus to the opening thumbnail on the next tick.
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Open media 2 of 3' }),
    ).toHaveFocus(),
  )

  // Reopening starts from the clicked thumbnail, not where the last visit ended.
  await user.click(screen.getByRole('button', { name: 'Open media 3 of 3' }))
  expect(screen.getByRole('dialog', { name: 'Photo 3' })).toBeInTheDocument()
})

test('keeps a single image free of gallery controls', async () => {
  const user = userEvent.setup()
  render(<ImageLightbox src="/test-image.png" alt="Tweet photo" />)

  await user.click(screen.getByRole('button', { name: 'Enlarge tweet photo' }))
  const dialog = screen.getByRole('dialog', { name: 'Tweet photo' })
  fireEvent.keyDown(dialog, { key: 'ArrowRight' })

  expect(dialog).toBeInTheDocument()
  expect(within(dialog).queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument()
  expect(
    within(dialog).queryByRole('button', { name: /(Next|Previous) image/ }),
  ).not.toBeInTheDocument()
  expect(
    within(dialog).queryByRole('link', { name: 'View post' }),
  ).not.toBeInTheDocument()
})
