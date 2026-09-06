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
    expect(within(currentSection!).getByText('Founder')).toBeInTheDocument()
    expect(
      within(currentSection!).getByRole('link', { name: 'Christine Shiba' }),
    ).toHaveAttribute('href', '/user/christineist')

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
})
