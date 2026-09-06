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
    for (const href of hrefs) {
      expect(href).toMatch(/^\/tweets\/\d+$/)
    }
  })
})
