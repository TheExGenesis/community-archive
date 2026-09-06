import { render, screen } from '@testing-library/react'
import LoginContent from './LoginContent'

jest.mock('@/components/SignIn', () => ({
  __esModule: true,
  default: () => <button>Sign in with Twitter</button>,
}))

it.each(['/search?q=100%', '/search?q=%E0%A4%A', '/search?q=%26'])(
  'keeps sign-in available for the already-parsed redirect %s',
  (redirectUrl) => {
    render(<LoginContent redirectUrl={redirectUrl} />)

    expect(
      screen.getByRole('button', { name: 'Sign in with Twitter' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(`You'll be redirected to: ${redirectUrl}`),
    ).toBeInTheDocument()
  },
)
