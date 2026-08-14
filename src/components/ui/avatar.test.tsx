import '@testing-library/jest-dom'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { Avatar, AvatarImage } from './avatar'

jest.mock('@radix-ui/react-avatar', () => ({
  Root: React.forwardRef<HTMLElement, React.ComponentProps<'span'>>(
    function MockAvatarRoot(props, ref) {
      return <span ref={ref} {...props} />
    },
  ),
  Image: React.forwardRef<HTMLImageElement, React.ComponentProps<'img'>>(
    function MockAvatarImage({ alt = '', ...props }, ref) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img ref={ref} alt={alt} {...props} />
    },
  ),
  Fallback: React.forwardRef<HTMLElement, React.ComponentProps<'span'>>(
    function MockAvatarFallback(props, ref) {
      return <span ref={ref} {...props} />
    },
  ),
}))

describe('AvatarImage', () => {
  it('requests the small variant by default', () => {
    render(
      <Avatar>
        <AvatarImage
          src="https://pbs.twimg.com/profile_images/42/avatar_400x400.jpg"
          alt="Compact avatar"
        />
      </Avatar>,
    )

    expect(screen.getByAltText('Compact avatar')).toHaveAttribute(
      'src',
      'https://pbs.twimg.com/profile_images/42/avatar_normal.jpg',
    )
  })

  it('allows profile headers to opt into the high-resolution variant', () => {
    render(
      <Avatar>
        <AvatarImage
          avatarSize="high"
          src="https://pbs.twimg.com/profile_images/42/avatar_normal.jpg"
          alt="Profile avatar"
        />
      </Avatar>,
    )

    expect(screen.getByAltText('Profile avatar')).toHaveAttribute(
      'src',
      'https://pbs.twimg.com/profile_images/42/avatar_400x400.jpg',
    )
  })
})
