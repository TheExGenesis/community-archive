import { render, screen, within } from '@testing-library/react'
import AboutPage from './page'

describe('AboutPage contributors', () => {
  it('links current and past contributors to their Archive profiles', () => {
    render(<AboutPage />)

    const currentHeading = screen.getByRole('heading', {
      name: 'Current Contributors',
    })
    const currentSection = currentHeading.closest('section')
    expect(currentSection).not.toBeNull()

    const xiqLink = within(currentSection!).getByRole('link', {
      name: 'Francisco Carvalho (Xiq)',
    })
    expect(xiqLink).toHaveAttribute('href', '/user/exgenesis')
    expect(xiqLink).toHaveTextContent('Francisco Carvalho (Xiq)')
    expect(within(xiqLink).getByText('(Xiq)')).toHaveClass(
      'text-muted-foreground',
    )
    expect(within(currentSection!).getByText('Founder')).toBeInTheDocument()
    expect(
      within(currentSection!).getByRole('link', { name: 'Christine Shiba' }),
    ).toHaveAttribute('href', '/user/christineist')

    const xiqCard = xiqLink.closest('.rounded-lg')
    expect(xiqCard?.querySelector('svg')).toBeNull()

    const pastHeading = screen.getByRole('heading', {
      name: 'Past Contributors',
    })
    const pastSection = pastHeading.closest('section')
    expect(pastSection).not.toBeNull()
    expect(
      within(pastSection!).getByRole('link', { name: '@DefenderOfBasic' }),
    ).toHaveAttribute('href', '/user/DefenderOfBasic')
    expect(
      within(pastSection!).getByRole('link', {
        name: 'Alexandre Variengien',
      }),
    ).toHaveAttribute('href', '/user/A_Variengien')
    expect(
      within(pastSection!).queryByText('Christine Shiba'),
    ).not.toBeInTheDocument()
  })

  it('removes the retired mission copy and hall-of-fame heading', () => {
    render(<AboutPage />)

    expect(
      screen.queryByText(/Twitter conversations represent a unique record/),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Contributor Hall of Fame' }),
    ).not.toBeInTheDocument()
  })
})
