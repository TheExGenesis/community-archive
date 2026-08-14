import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileMenu from './MobileMenu'

const mockSignOut = jest.fn()

jest.mock('@/hooks/useAuthAndArchive', () => ({
  useAuthAndArchive: () => ({
    userMetadata: {
      provider_id: '42',
      user_name: 'alice',
      avatar_url: 'https://pbs.twimg.com/profile_images/42/alice.jpg',
    },
  }),
}))

jest.mock('@/utils/supabase', () => ({
  createBrowserClient: () => ({ auth: { signOut: mockSignOut } }),
}))

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))

test('uses the signed-in avatar and links Profile separately from Settings', async () => {
  const user = userEvent.setup()
  const { container } = render(<MobileMenu />)

  expect(container.querySelector('img')).toHaveAttribute(
    'src',
    'https://pbs.twimg.com/profile_images/42/alice.jpg',
  )

  await user.click(screen.getByRole('button', { name: 'Open account menu' }))

  expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute(
    'href',
    '/user/alice',
  )
  expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute(
    'href',
    '/settings',
  )
})
