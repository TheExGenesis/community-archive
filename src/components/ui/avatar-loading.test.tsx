import { fireEvent, render, screen } from '@testing-library/react'
import { Avatar, AvatarFallback, AvatarImage } from './avatar'

afterEach(() => jest.restoreAllMocks())

it('omits the referrer during the real Radix preload and displayed avatar request', () => {
  const preloads: HTMLImageElement[] = []
  jest.spyOn(window, 'Image').mockImplementation(() => {
    const image = document.createElement('img')
    preloads.push(image)
    return image
  })

  render(
    <Avatar>
      <AvatarImage
        src="https://pbs.twimg.com/profile_images/42/avatar_normal.jpg"
        alt="Member avatar"
      />
      <AvatarFallback>M</AvatarFallback>
    </Avatar>,
  )

  // A policy on the final DOM image alone cannot fix a rejected preload:
  // Radix leaves the initial visible and never mounts that image.
  expect(screen.getByText('M')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(preloads).toHaveLength(1)
  expect(preloads[0].referrerPolicy).toBe('no-referrer')
  fireEvent.load(preloads[0])
  expect(screen.getByRole('img', { name: 'Member avatar' })).toHaveAttribute(
    'referrerpolicy',
    'no-referrer',
  )
  expect(screen.queryByText('M')).not.toBeInTheDocument()
})
