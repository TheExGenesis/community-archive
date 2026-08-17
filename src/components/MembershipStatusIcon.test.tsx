import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MembershipStatusIcon } from './MembershipStatusIcon'

test.each([
  { hasArchive: true, isOptedIn: false, label: 'Archive uploaded' },
  { hasArchive: false, isOptedIn: true, label: 'Opted in' },
])('shows the $label icon and tooltip', async (status) => {
  const user = userEvent.setup()
  render(<MembershipStatusIcon {...status} />)

  const icon = screen.getByRole('img', { name: status.label })
  expect(icon).toHaveClass(
    status.hasArchive ? 'text-muted-foreground/60' : 'text-brand/60',
  )

  await user.hover(icon)
  expect(await screen.findByRole('tooltip')).toHaveTextContent(status.label)
})

test('renders no status for a non-member', () => {
  const { container } = render(
    <MembershipStatusIcon hasArchive={false} isOptedIn={false} />,
  )

  expect(container).toBeEmptyDOMElement()
})
