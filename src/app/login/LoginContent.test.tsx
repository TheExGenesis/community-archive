import { render, screen } from '@testing-library/react'
import LoginContent from './LoginContent'

jest.mock('@/components/SignIn', () => ({
  __esModule: true,
  default: ({ fullPage }: { fullPage?: boolean }) => (
    <button data-full-page={fullPage}>Sign in with Twitter</button>
  ),
}))

it.each(['/search?q=100%', '/search?q=%E0%A4%A', '/search?q=%26'])(
  'keeps sign-in available for the already-parsed redirect %s',
  (redirectUrl) => {
    render(<LoginContent redirectUrl={redirectUrl} />)

    expect(
      screen.getByRole('button', { name: 'Sign in with Twitter' }),
    ).toHaveAttribute('data-full-page', 'true')
    expect(
      screen.getByText(`You'll be redirected to: ${redirectUrl}`),
    ).toBeInTheDocument()
  },
)

test('arriving from Ask the archive, it says what signing in is for and shows the question', () => {
  render(
    <LoginContent redirectUrl="/search/ask?q=who+writes+about+singapore&fromUser=visakanv" />,
  )
  expect(
    screen.getByText(/Ask the archive reads members’ tweets/),
  ).toBeInTheDocument()
  expect(screen.getByText('who writes about singapore')).toBeInTheDocument()
  expect(screen.queryByText(/redirected to/)).toBeNull()
})
