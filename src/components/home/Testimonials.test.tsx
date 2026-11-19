import { render, screen } from '@testing-library/react'
import Testimonials from './Testimonials'

describe('Testimonials', () => {
  it('links testimonials to archived tweets', () => {
    render(<Testimonials />)

    expect(
      screen.getByRole('heading', { name: 'Testimonials' }),
    ).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    const hrefs = links.map((link) => link.getAttribute('href'))
    expect(hrefs[2]).toBe(
      'https://x.com/TheStalwart/status/2123168196932813047',
    )
    for (const href of hrefs) {
      expect(href).toMatch(
        /^(\/tweets\/\d+|https:\/\/x\.com\/\w+\/status\/\d+)$/,
      )
    }
  })
})
